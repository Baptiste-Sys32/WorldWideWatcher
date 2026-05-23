import { NextResponse } from "next/server";
import {
    mergeAndDedupeEntities,
    isFranceEntity,
    normalizeFranceDiseaseIndicators,
    normalizeGdacsEvents,
    normalizeMeteoFranceAlerts,
    normalizePointFeed,
    normalizePropluviaRestrictions,
    normalizeVigicruesStations,
    normalizeWhoDiseaseOutbreaks,
} from "@/plugins/globalFeeds/normalizers";
import type { FeedEntity, FeedResponse, GlobalFeedId } from "@/plugins/globalFeeds/types";

export const FEED_REVALIDATE_SECONDS = 300;

type Adapter = () => Promise<FeedEntity[]>;

const ENDPOINTS = {
    gdacsCyclones: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtypes=TC",
    gdacsFloods: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtypes=FL",
    nasaDrought: "https://www.drought.gov/feeds/json/drought.json",
    whoDon: "https://www.who.int/feeds/entity/csr/don/en/rss.xml",
    meteoFranceVigilance: "https://vigilance.meteofrance.fr/data/NXFR34_LFPW_.json",
    vigicruesStations: "https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?size=1000&en_service=true",
    propluvia: "https://www.data.gouv.fr/api/1/datasets/restrictions-deau-propluvia/",
    santePubliqueFrance: "https://www.data.gouv.fr/api/1/organizations/sante-publique-france/",
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

async function safeAdapter(name: string, adapter: Adapter): Promise<FeedEntity[]> {
    try {
        return await adapter();
    } catch (error) {
        console.warn(`[GlobalFeeds:${name}] adapter failed`, error);
        return [];
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

export async function fetchFranceDiseaseOutbreaks(): Promise<FeedEntity[]> {
    const data = await fetchJson(ENDPOINTS.santePubliqueFrance);
    return normalizeFranceDiseaseIndicators(data);
}

const ADAPTERS: Record<GlobalFeedId, { global: Adapter; france: Adapter }> = {
    "tropical-cyclones": {
        global: fetchGlobalTropicalCyclones,
        france: fetchFranceTropicalCyclones,
    },
    "flood-alerts": {
        global: fetchGlobalFloodAlerts,
        france: fetchFranceFloodAlerts,
    },
    "drought-vegetation": {
        global: fetchGlobalDroughtVegetation,
        france: fetchFranceDroughtVegetation,
    },
    "disease-outbreaks": {
        global: fetchGlobalDiseaseOutbreaks,
        france: fetchFranceDiseaseOutbreaks,
    },
};

export async function feedResponse(feedId: GlobalFeedId): Promise<NextResponse<FeedResponse>> {
    const adapters = ADAPTERS[feedId];
    const [globalItems, franceItems] = await Promise.all([
        safeAdapter(`${feedId}:global`, adapters.global),
        safeAdapter(`${feedId}:france`, adapters.france),
    ]);
    return NextResponse.json({
        items: mergeAndDedupeEntities(globalItems, franceItems),
    });
}
