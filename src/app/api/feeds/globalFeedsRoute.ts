import { NextResponse } from "next/server";
import {
    mergeAndDedupeEntities,
    isFranceEntity,
    normalizeFranceDiseaseIndicators,
    normalizeGdacsEvents,
    normalizeCelestrakSatellites,
    normalizeEonetWildfires,
    normalizeFirmsCsv,
    normalizeGpsJamming,
    normalizeMeteoFranceAlerts,
    normalizeNdbcLatest,
    normalizeNwsAlerts,
    normalizeOpenAqLatest,
    normalizeOpenMeteoAirQuality,
    normalizePointFeed,
    normalizePowerOutages,
    normalizePropluviaRestrictions,
    normalizeUsgsVolcanicAshAdvisories,
    normalizeVigicruesStations,
    normalizeWhoDiseaseOutbreaks,
} from "@/plugins/globalFeeds/normalizers";
import { sanitizeHealthMessage } from "@/core/state/sourceHealthSlice";
import type {
    FeedEntity,
    FeedResponse,
    FeedSourceAudit,
    GlobalFeedId,
    SourceScope,
} from "@/plugins/globalFeeds/types";

export const FEED_REVALIDATE_SECONDS = 300;

type AdapterResult = FeedEntity[] | {
    items: FeedEntity[];
    sources?: FeedSourceAudit[];
};
type Adapter = () => Promise<AdapterResult>;

interface AdapterConfig {
    sourceName: string;
    scope: SourceScope;
    adapter: Adapter;
}

const ENDPOINTS = {
    gdacsCyclones: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtypes=TC",
    gdacsFloods: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtypes=FL",
    nasaDrought: "https://www.drought.gov/feeds/json/drought.json",
    whoDon: "https://www.who.int/feeds/entity/csr/don/en/rss.xml",
    firmsArea: "https://firms.modaps.eosdis.nasa.gov/api/area/csv",
    eonetWildfires: "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=100",
    openAqLatest: "https://api.openaq.org/v3/latest?limit=1000",
    ndbcLatest: "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt",
    ndbcStations: "https://www.ndbc.noaa.gov/activestations.xml",
    celestrakStations: "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json",
    celestrakWeather: "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json",
    celestrakStarlink: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json",
    celestrakStarlinkTle: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
    gpsJamming: process.env.GPS_JAMMING_FEED_URL ?? "https://dataenginev2.worldwideview.dev/api/gps-jamming",
    nwsAlerts: "https://api.weather.gov/alerts/active",
    meteoFranceVigilance: "https://vigilance.meteofrance.fr/data/NXFR34_LFPW_.json",
    vigicruesStations: "https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?size=1000&en_service=true",
    propluvia: "https://www.data.gouv.fr/api/1/datasets/restrictions-deau-propluvia/",
    santePubliqueFrance: "https://www.data.gouv.fr/api/1/organizations/sante-publique-france/",
    usgsElevatedVolcanoes: "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes",
    usgsVolcanoes: "https://volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes",
    powerOutages: process.env.POWER_OUTAGE_FEED_URL,
};

function textToPseudoItems(xml: string): unknown[] {
    const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
    const tag = (item: string, name: string) => {
        const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
        return match?.[1]
            ?.replace(/<!\[CDATA\[|\]\]>/g, "")
            .replace(/<[^>]+>/g, "")
            .trim();
    };
    return Array.from(xml.matchAll(itemPattern)).map((match) => ({
        title: tag(match[1], "title"),
        pubDate: tag(match[1], "pubDate"),
        guid: tag(match[1], "guid") ?? tag(match[1], "link"),
        latitude: undefined,
        longitude: undefined,
    }));
}

async function fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
        headers: {
            Accept: "application/json, application/geo+json, text/xml;q=0.8, */*;q=0.5",
            "User-Agent": "WorldWideView/2.16 global-feeds",
        },
        next: { revalidate: FEED_REVALIDATE_SECONDS },
    });
    if (!response.ok) {
        throw new Error(`upstream returned HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("xml") || contentType.includes("rss")) {
        return textToPseudoItems(await response.text());
    }
    return response.json();
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
    const response = await fetch(url, {
        headers: {
            Accept: "text/plain, text/csv, application/json;q=0.8, */*;q=0.5",
            "User-Agent": "WorldWideView/2.16 global-feeds",
            ...headers,
        },
        next: { revalidate: FEED_REVALIDATE_SECONDS },
    });
    if (!response.ok) {
        throw new Error(`upstream returned HTTP ${response.status}`);
    }
    return response.text();
}

function parseNdbcStationsXml(xml: string): Record<string, { name?: string; latitude: number; longitude: number }> {
    const stations: Record<string, { name?: string; latitude: number; longitude: number }> = {};
    const stationPattern = /<station\b([^>]*)\/?>/gi;
    const attr = (attrs: string, name: string) => {
        const match = attrs.match(new RegExp(`${name}="([^"]*)"`, "i"));
        return match?.[1];
    };
    for (const match of xml.matchAll(stationPattern)) {
        const attrs = match[1];
        const id = attr(attrs, "id");
        const latitude = Number(attr(attrs, "lat"));
        const longitude = Number(attr(attrs, "lon"));
        if (id && Number.isFinite(latitude) && Number.isFinite(longitude)) {
            stations[id] = { name: attr(attrs, "name"), latitude, longitude };
        }
    }
    return stations;
}

function parseTleText(text: string): unknown[] {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const records: unknown[] = [];
    for (let index = 0; index < lines.length - 1; index++) {
        const maybeName = lines[index];
        const line1 = lines[index + 1];
        const line2 = lines[index + 2];
        if (!line1?.startsWith("1 ") || !line2?.startsWith("2 ")) continue;
        records.push({
            OBJECT_NAME: maybeName,
            NORAD_CAT_ID: line1.slice(2, 7).trim(),
            TLE_LINE1: line1,
            TLE_LINE2: line2,
        });
        index += 2;
    }
    return records;
}

/**
 * Executes a feed adapter while capturing audit diagnostics.
 *
 * @param config - Adapter metadata including source name and scope.
 * @returns Adapter results and an audit summary.
 */
async function runAdapterWithAudit(config: AdapterConfig): Promise<{ items: FeedEntity[]; audits: FeedSourceAudit[] }> {
    const started = Date.now();
    try {
        const result = await config.adapter();
        const items = Array.isArray(result) ? result : result.items;
        const sources = Array.isArray(result) ? undefined : result.sources;
        return {
            items,
            audits: sources ?? [{
                sourceName: config.sourceName,
                scope: config.scope,
                ok: true,
                count: items.length,
                latencyMs: Math.max(0, Date.now() - started),
            }],
        };
    } catch (error) {
        console.warn(`[GlobalFeeds:${config.sourceName}] adapter failed`, error);
        return {
            items: [],
            audits: [{
                sourceName: config.sourceName,
                scope: config.scope,
                ok: false,
                count: 0,
                errorMessage: sanitizeHealthMessage(error instanceof Error ? error.message : String(error)) ?? "Adapter failed",
                latencyMs: Math.max(0, Date.now() - started),
            }],
        };
    }
}

export async function fetchGlobalTropicalCyclones(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.gdacsCyclones);
    return normalizeGdacsEvents("tropical-cyclones", data, "tropical-cyclone");
}

export async function fetchFranceTropicalCyclones(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.meteoFranceVigilance);
    return normalizeMeteoFranceAlerts(data);
}

export async function fetchGlobalFloodAlerts(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.gdacsFloods);
    return normalizeGdacsEvents("flood-alerts", data, "flood");
}

export async function fetchFranceFloodAlerts(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.vigicruesStations);
    return normalizeVigicruesStations(data);
}

export async function fetchGlobalDroughtVegetation(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.nasaDrought);
    return normalizePointFeed(
        "drought-vegetation",
        data,
        { scope: "global", sourceName: "NASA/MODIS" },
        "drought",
    ).filter((entity) => !isFranceEntity(entity));
}

export async function fetchFranceDroughtVegetation(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.propluvia);
    return normalizePropluviaRestrictions(data);
}

export async function fetchGlobalDiseaseOutbreaks(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.whoDon);
    return normalizeWhoDiseaseOutbreaks(data);
}

export async function fetchVolcanicAshAdvisories(): Promise<FeedEntity[]> {
    const [elevated, volcanoes] = await Promise.all([
        fetchJson(ENDPOINTS.usgsElevatedVolcanoes),
        fetchJson(ENDPOINTS.usgsVolcanoes),
    ]);
    return normalizeUsgsVolcanicAshAdvisories(elevated, volcanoes);
}

export async function fetchPowerOutages(): Promise<{ items: FeedEntity[]; sources: FeedSourceAudit[] }> {
    if (!ENDPOINTS.powerOutages) {
        return {
            items: [],
            sources: [{
                sourceName: "Power outage public source",
                scope: "us",
                ok: false,
                count: 0,
                errorMessage: "No reliable public power outage feed configured. Set POWER_OUTAGE_FEED_URL to enable this feed.",
                latencyMs: 0,
            }],
        };
    }
    const started = Date.now();
    const data = await fetchJson(ENDPOINTS.powerOutages);
    const items = normalizePowerOutages(data);
    return {
        items,
        sources: [{
            sourceName: "Configured power outage feed",
            scope: "us",
            ok: true,
            count: items.length,
            latencyMs: Math.max(0, Date.now() - started),
        }],
    };
}

export async function fetchFranceDiseaseOutbreaks(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.santePubliqueFrance);
    return normalizeFranceDiseaseIndicators(data);
}

export async function fetchWildfireHotspots(): Promise<FeedEntity[]> {
    const mapKey = process.env.NASA_FIRMS_MAP_KEY;
    if (mapKey) {
        const params = new URLSearchParams({
            source: "VIIRS_SNPP_NRT",
            area: "world",
            day_range: "1",
        });
        const csv = await fetchText(`${ENDPOINTS.firmsArea}/${mapKey}/${params.get("source")}/${params.get("area")}/${params.get("day_range")}`);
        return normalizeFirmsCsv(csv);
    }
    const data = await fetchJson(ENDPOINTS.eonetWildfires);
    return normalizeEonetWildfires(data);
}

export async function fetchAirQuality(): Promise<FeedEntity[]> {
    try {
        const headers: Record<string, string> = {};
        if (process.env.OPENAQ_API_KEY) headers["X-API-Key"] = process.env.OPENAQ_API_KEY;
        const response = await fetch(ENDPOINTS.openAqLatest, {
            headers: {
                Accept: "application/json",
                "User-Agent": "WorldWideView/2.16 global-feeds",
                ...headers,
            },
            next: { revalidate: FEED_REVALIDATE_SECONDS },
        });
        if (response.ok) {
            const normalized = normalizeOpenAqLatest(await response.json());
            if (normalized.length > 0) return normalized;
        }
    } catch {
        // Fall through to the no-key sample grid.
    }
    const cities = [
        { city: "Paris", latitude: 48.8566, longitude: 2.3522 },
        { city: "New York", latitude: 40.7128, longitude: -74.006 },
        { city: "Delhi", latitude: 28.6139, longitude: 77.209 },
        { city: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
        { city: "Sydney", latitude: -33.8688, longitude: 151.2093 },
    ];
    const results = await Promise.all(cities.map(async (city) => {
        const params = new URLSearchParams({
            latitude: String(city.latitude),
            longitude: String(city.longitude),
            current: "pm2_5",
            timezone: "UTC",
        });
        const data = await fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`);
        return { ...city, ...(typeof data === "object" && data ? data : {}) };
    }));
    return normalizeOpenMeteoAirQuality(results);
}

export async function fetchMarineBuoys(): Promise<FeedEntity[]> {
    const [text, stationXml] = await Promise.all([
        fetchText(ENDPOINTS.ndbcLatest),
        fetchText(ENDPOINTS.ndbcStations, { Accept: "application/xml, text/xml, */*" }),
    ]);
    return normalizeNdbcLatest(text, parseNdbcStationsXml(stationXml));
}

async function fetchCelestrakGroup(
    group: "stations" | "weather" | "starlink",
    url: string,
    fallbackTleUrl?: string,
): Promise<{ items: FeedEntity[]; audit: FeedSourceAudit }> {
    const started = Date.now();
    const normalizeGroupData = (data: unknown) => normalizeCelestrakSatellites(data, group);
    try {
        const data = await fetchJson(url);
        let items = normalizeGroupData(data);
        if (items.length === 0 && fallbackTleUrl) {
            items = normalizeGroupData(parseTleText(await fetchText(fallbackTleUrl)));
        }
        if (items.length === 0) {
            return {
                items,
                audit: {
                    sourceName: `CelesTrak ${group}`,
                    scope: group,
                    ok: false,
                    count: 0,
                    errorMessage: "CelesTrak group returned no usable items",
                    latencyMs: Math.max(0, Date.now() - started),
                },
            };
        }
        return {
            items,
            audit: {
                sourceName: `CelesTrak ${group}`,
                scope: group,
                ok: true,
                count: items.length,
                latencyMs: Math.max(0, Date.now() - started),
            },
        };
    } catch (error) {
        if (fallbackTleUrl) {
            try {
                const items = normalizeGroupData(parseTleText(await fetchText(fallbackTleUrl)));
                if (items.length > 0) {
                    return {
                        items,
                        audit: {
                            sourceName: `CelesTrak ${group}`,
                            scope: group,
                            ok: true,
                            count: items.length,
                            errorMessage: sanitizeHealthMessage(error instanceof Error ? `JSON failed; TLE fallback used (${error.message})` : "JSON failed; TLE fallback used") ?? "TLE fallback used",
                            latencyMs: Math.max(0, Date.now() - started),
                        },
                    };
                }
            } catch {
                // Report the original JSON error below; both Starlink sources failed.
            }
        }
        return {
            items: [],
            audit: {
                sourceName: `CelesTrak ${group}`,
                scope: group,
                ok: false,
                count: 0,
                errorMessage: sanitizeHealthMessage(error instanceof Error ? error.message : String(error)) ?? "CelesTrak group failed",
                latencyMs: Math.max(0, Date.now() - started),
            },
        };
    }
}

export async function fetchSatellites(): Promise<{ items: FeedEntity[]; sources: FeedSourceAudit[] }> {
    const groups = await Promise.all([
        fetchCelestrakGroup("stations", ENDPOINTS.celestrakStations),
        fetchCelestrakGroup("weather", ENDPOINTS.celestrakWeather),
        fetchCelestrakGroup("starlink", ENDPOINTS.celestrakStarlink, ENDPOINTS.celestrakStarlinkTle),
    ]);
    return {
        items: groups.flatMap((group) => group.items),
        sources: groups.map((group) => group.audit),
    };
}

export async function fetchGpsJamming(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.gpsJamming);
    return normalizeGpsJamming(data);
}

export async function fetchUsWeatherAlerts(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.nwsAlerts);
    return normalizeNwsAlerts(data);
}

const ADAPTERS: Record<GlobalFeedId, { global: AdapterConfig; france: AdapterConfig }> = {
    "tropical-cyclones": {
        global: {
            sourceName: "GDACS",
            scope: "global",
            adapter: fetchGlobalTropicalCyclones,
        },
        france: {
            sourceName: "Meteo-France",
            scope: "france",
            adapter: fetchFranceTropicalCyclones,
        },
    },
    "flood-alerts": {
        global: {
            sourceName: "GDACS",
            scope: "global",
            adapter: fetchGlobalFloodAlerts,
        },
        france: {
            sourceName: "Vigicrues",
            scope: "france",
            adapter: fetchFranceFloodAlerts,
        },
    },
    "drought-vegetation": {
        global: {
            sourceName: "NASA/MODIS",
            scope: "global",
            adapter: fetchGlobalDroughtVegetation,
        },
        france: {
            sourceName: "Propluvia",
            scope: "france",
            adapter: fetchFranceDroughtVegetation,
        },
    },
    "disease-outbreaks": {
        global: {
            sourceName: "WHO",
            scope: "global",
            adapter: fetchGlobalDiseaseOutbreaks,
        },
        france: {
            sourceName: "Sante publique France",
            scope: "france",
            adapter: fetchFranceDiseaseOutbreaks,
        },
    },
    "volcanic-ash-advisories": {
        global: {
            sourceName: "USGS HANS",
            scope: "us",
            adapter: fetchVolcanicAshAdvisories,
        },
        france: {
            sourceName: "France scoped fallback",
            scope: "france",
            adapter: async () => [],
        },
    },
    "power-outages": {
        global: {
            sourceName: "Configured power outage feed",
            scope: "us",
            adapter: fetchPowerOutages,
        },
        france: {
            sourceName: "France scoped fallback",
            scope: "france",
            adapter: async () => [],
        },
    },
    "wildfire-hotspots": {
        global: {
            sourceName: process.env.NASA_FIRMS_MAP_KEY ? "NASA FIRMS" : "NASA EONET",
            scope: "global",
            adapter: fetchWildfireHotspots,
        },
        france: {
            sourceName: "France scoped fallback",
            scope: "france",
            adapter: async () => [],
        },
    },
    "air-quality": {
        global: {
            sourceName: process.env.OPENAQ_API_KEY ? "OpenAQ" : "OpenAQ/Open-Meteo",
            scope: "global",
            adapter: fetchAirQuality,
        },
        france: {
            sourceName: "France scoped fallback",
            scope: "france",
            adapter: async () => [],
        },
    },
    "marine-buoys": {
        global: {
            sourceName: "NOAA NDBC",
            scope: "global",
            adapter: fetchMarineBuoys,
        },
        france: {
            sourceName: "France scoped fallback",
            scope: "france",
            adapter: async () => [],
        },
    },
    satellites: {
        global: {
            sourceName: "CelesTrak",
            scope: "global",
            adapter: fetchSatellites,
        },
        france: {
            sourceName: "France scoped fallback",
            scope: "france",
            adapter: async () => [],
        },
    },
    "gps-jamming": {
        global: {
            sourceName: "GPSJam / WorldWideView data engine",
            scope: "global",
            adapter: fetchGpsJamming,
        },
        france: {
            sourceName: "France scoped fallback",
            scope: "france",
            adapter: async () => [],
        },
    },
    "us-weather-alerts": {
        global: {
            sourceName: "NOAA/NWS",
            scope: "us",
            adapter: fetchUsWeatherAlerts,
        },
        france: {
            sourceName: "France scoped fallback",
            scope: "france",
            adapter: async () => [],
        },
    },
};

/**
 * Builds the API response for a global feed, including optional audit metadata.
 *
 * @param feedId - Feed identifier to resolve.
 * @returns NextResponse with normalized feed entities and source diagnostics.
 */
export async function feedResponse(feedId: GlobalFeedId): Promise<NextResponse<FeedResponse>> {
    const adapters = ADAPTERS[feedId];
    const [globalResult, franceResult] = await Promise.all([
        runAdapterWithAudit(adapters.global),
        runAdapterWithAudit(adapters.france),
    ]);
    return NextResponse.json({
        items: mergeAndDedupeEntities(globalResult.items, franceResult.items),
        sources: [...globalResult.audits, ...franceResult.audits],
    });
}
