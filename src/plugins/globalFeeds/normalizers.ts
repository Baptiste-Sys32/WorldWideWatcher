import {
    gstime, propagate, twoline2satrec, eciToGeodetic, json2satrec
} from "satellite.js";
import type { GeoEntity } from "@/core/plugins/PluginTypes";
import type { FeedEntity, GlobalFeedId, SourceMeta } from "./types";

const FRANCE_NAMES = new Set([
    "france",
    "french republic",
    "guadeloupe",
    "martinique",
    "guyane",
    "french guiana",
    "reunion",
    "réunion",
    "mayotte",
    "saint-martin",
    "saint barthelemy",
    "saint-barthelemy",
    "saint pierre and miquelon",
    "saint-pierre-et-miquelon",
    "french polynesia",
    "new caledonia",
    "wallis and futuna",
]);

const FRANCE_BOUNDS = {
    minLat: -22,
    maxLat: 52,
    minLon: -63,
    maxLon: 56,
};

export const FRANCE_CENTROID = { latitude: 46.2276, longitude: 2.2137 };

const REGION_CENTROIDS: Record<string, { latitude: number; longitude: number }> = {
    "auvergne-rhone-alpes": { latitude: 45.45, longitude: 4.39 },
    "bourgogne-franche-comte": { latitude: 47.28, longitude: 4.99 },
    bretagne: { latitude: 48.2, longitude: -2.93 },
    "centre-val-de-loire": { latitude: 47.75, longitude: 1.68 },
    corse: { latitude: 42.04, longitude: 9.01 },
    "grand-est": { latitude: 48.7, longitude: 6.19 },
    "hauts-de-france": { latitude: 50.48, longitude: 2.79 },
    "ile-de-france": { latitude: 48.85, longitude: 2.35 },
    normandie: { latitude: 49.18, longitude: 0.37 },
    "nouvelle-aquitaine": { latitude: 45.71, longitude: 0.63 },
    occitanie: { latitude: 43.7, longitude: 2.14 },
    "pays-de-la-loire": { latitude: 47.47, longitude: -0.82 },
    "provence-alpes-cote-d-azur": { latitude: 43.94, longitude: 6.07 },
};

const COUNTRY_CENTROIDS: Record<string, { latitude: number; longitude: number }> = {
    france: FRANCE_CENTROID,
    "united-states": { latitude: 39.8, longitude: -98.6 },
    usa: { latitude: 39.8, longitude: -98.6 },
    canada: { latitude: 56.1, longitude: -106.3 },
    mexico: { latitude: 23.6, longitude: -102.5 },
    brazil: { latitude: -14.2, longitude: -51.9 },
    argentina: { latitude: -38.4, longitude: -63.6 },
    "united-kingdom": { latitude: 55.4, longitude: -3.4 },
    spain: { latitude: 40.5, longitude: -3.7 },
    italy: { latitude: 42.5, longitude: 12.6 },
    germany: { latitude: 51.2, longitude: 10.4 },
    india: { latitude: 20.6, longitude: 78.9 },
    china: { latitude: 35.9, longitude: 104.2 },
    japan: { latitude: 36.2, longitude: 138.3 },
    australia: { latitude: -25.3, longitude: 133.8 },
    indonesia: { latitude: -0.8, longitude: 113.9 },
    philippines: { latitude: 12.9, longitude: 121.8 },
    nigeria: { latitude: 9.1, longitude: 8.7 },
    "democratic-republic-of-the-congo": { latitude: -2.9, longitude: 23.7 },
    "south-africa": { latitude: -30.6, longitude: 22.9 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberFrom(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function stringFrom(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return undefined;
}

function boolish(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return ["true", "yes", "1"].includes(value.trim().toLowerCase());
    return false;
}

function severityFrom(value: unknown): string | number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return stringFrom(value);
}

function dateFrom(value: unknown): Date {
    const raw = typeof value === "string" || typeof value === "number" ? value : undefined;
    const date = new Date(raw ?? Date.now());
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function slug(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function toArray(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (!isRecord(data)) return [];
    for (const key of ["items", "data", "features", "events", "value", "results", "records"]) {
        const candidate = data[key];
        if (Array.isArray(candidate)) return candidate;
    }
    return [];
}

function coordinatesFromGeoJsonGeometry(geometry: unknown): { latitude: number; longitude: number } | null {
    if (!isRecord(geometry)) return null;
    const coordinates = geometry.coordinates;
    if (!Array.isArray(coordinates)) return null;

    let cursor: unknown = coordinates;
    while (Array.isArray(cursor) && Array.isArray(cursor[0])) {
        cursor = cursor[0];
    }
    if (!Array.isArray(cursor)) return null;
    const longitude = numberFrom(cursor[0]);
    const latitude = numberFrom(cursor[1]);
    return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;
}

function pickCoordinates(item: Record<string, unknown>): { latitude: number; longitude: number } | null {
    const latitude = numberFrom(item.lat ?? item.latitude ?? item.y);
    const longitude = numberFrom(item.lon ?? item.lng ?? item.longitude ?? item.x);
    if (latitude !== undefined && longitude !== undefined) return { latitude, longitude };

    const properties = isRecord(item.properties) ? item.properties : {};
    const propLatitude = numberFrom(properties.lat ?? properties.latitude ?? properties.y);
    const propLongitude = numberFrom(properties.lon ?? properties.lng ?? properties.longitude ?? properties.x);
    if (propLatitude !== undefined && propLongitude !== undefined) {
        return { latitude: propLatitude, longitude: propLongitude };
    }

    const geometry = coordinatesFromGeoJsonGeometry(item.geometry);
    if (geometry) return geometry;

    const centroid = isRecord(item.centroid) ? pickCoordinates(item.centroid) : null;
    if (centroid) return centroid;

    return null;
}

function pickCountry(item: Record<string, unknown>): string | undefined {
    const properties = isRecord(item.properties) ? item.properties : {};
    const explicit = stringFrom(
        item.country
        ?? item.countryName
        ?? item.iso3
        ?? item.iso2
        ?? properties.country
        ?? properties.countryName
        ?? properties.iso3
        ?? properties.iso2,
    );
    if (explicit) return explicit;

    const title = stringFrom(item.title ?? item.name ?? properties.title);
    if (!title) return undefined;
    const normalizedTitle = title.toLowerCase();
    for (const country of Object.keys(COUNTRY_CENTROIDS)) {
        if (normalizedTitle.includes(country.replace(/-/g, " "))) return country;
    }
    return undefined;
}

function looksFranceCountry(value: unknown): boolean {
    if (!value) return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === "fr" || normalized === "fra" || FRANCE_NAMES.has(normalized);
}

export function isFranceEntity(entity: GeoEntity): boolean {
    const country = entity.properties?.country;
    if (looksFranceCountry(country)) return true;
    const location = entity.properties?.location ?? entity.properties?.area ?? entity.label;
    if (looksFranceCountry(location)) return true;
    return entity.latitude >= FRANCE_BOUNDS.minLat
        && entity.latitude <= FRANCE_BOUNDS.maxLat
        && entity.longitude >= FRANCE_BOUNDS.minLon
        && entity.longitude <= FRANCE_BOUNDS.maxLon
        && (String(country ?? location ?? "").toLowerCase().includes("france"));
}

function buildEntity(
    feedId: GlobalFeedId,
    item: Record<string, unknown>,
    index: number,
    meta: SourceMeta,
    fallbackType: string,
): FeedEntity | null {
    const properties = isRecord(item.properties) ? item.properties : {};
    const country = pickCountry(item);
    const coordinates = pickCoordinates(item) ?? (country ? COUNTRY_CENTROIDS[slug(country)] : undefined);
    if (!coordinates) return null;

    const sourceId = stringFrom(item.id ?? item.eventid ?? item.eventId ?? item.guid ?? properties.id ?? properties.eventid);
    const timestampValue = item.timestamp ?? item.date ?? item.pubDate ?? item.from ?? item.updated ?? properties.date ?? properties.fromdate ?? properties.pubDate;
    const timestamp = dateFrom(timestampValue);
    const name = stringFrom(item.name ?? item.title ?? item.eventname ?? properties.name ?? properties.title ?? properties.eventname)
        ?? `${meta.sourceName} ${fallbackType}`;
    const eventType = stringFrom(item.eventType ?? item.type ?? item.eventtype ?? properties.eventType ?? properties.type)
        ?? fallbackType;
    const severity = item.severity ?? item.alertLevel ?? item.level ?? item.alertlevel ?? properties.severity ?? properties.alertLevel ?? properties.level;

    return {
        id: sourceId ? `${feedId}-${meta.scope}-${slug(sourceId)}` : `${feedId}-${meta.scope}-${index}-${timestamp.getTime()}`,
        pluginId: feedId,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        timestamp,
        label: name,
        properties: {
            ...properties,
            sourceScope: meta.scope,
            sourceName: meta.sourceName,
            eventType,
            country,
            severity: severityFrom(severity),
            sourceId,
        },
    };
}

export function normalizePointFeed(
    feedId: GlobalFeedId,
    data: unknown,
    meta: SourceMeta,
    fallbackType: string,
): FeedEntity[] {
    return toArray(data)
        .flatMap((raw, index) => {
            if (!isRecord(raw)) return [];
            const entity = buildEntity(feedId, raw, index, meta, fallbackType);
            return entity ? [entity] : [];
        });
}

export function normalizeGdacsEvents(
    feedId: GlobalFeedId,
    data: unknown,
    eventType: "tropical-cyclone" | "flood",
): FeedEntity[] {
    return normalizePointFeed(feedId, data, { scope: "global", sourceName: "GDACS" }, eventType)
        .filter((entity) => !isFranceEntity(entity));
}

export function normalizeMeteoFranceAlerts(data: unknown): FeedEntity[] {
    return toArray(data).flatMap((raw, index) => {
        if (!isRecord(raw)) return [];
        const dept = stringFrom(raw.domain_id ?? raw.department ?? raw.dept ?? raw.code ?? raw.id) ?? `area-${index}`;
        const coords = pickCoordinates(raw) ?? FRANCE_CENTROID;
        const timestamp = dateFrom(raw.update_time ?? raw.timestamp ?? raw.date);
        const phenomenon = stringFrom(raw.phenomenon ?? raw.type ?? raw.risk ?? raw.name) ?? "cyclone/wind/rain-flood";
        return [{
            id: `tropical-cyclones-france-${slug(dept)}-${timestamp.getTime()}`,
            pluginId: "tropical-cyclones",
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp,
            label: `Meteo-France ${phenomenon}`,
            properties: {
                ...raw,
                sourceScope: "france" as const,
                sourceName: "Meteo-France",
                eventType: "tropical-cyclone",
                country: "France",
                severity: severityFrom(raw.color ?? raw.level ?? raw.alertLevel),
            },
        }];
    });
}

export function normalizeVigicruesStations(data: unknown): FeedEntity[] {
    return toArray(data).flatMap((raw, index) => {
        if (!isRecord(raw)) return [];
        const coords = pickCoordinates(raw);
        if (!coords) return [];
        const timestamp = dateFrom(raw.date_obs ?? raw.timestamp ?? raw.date);
        const stationId = stringFrom(raw.code_station ?? raw.station_id ?? raw.id) ?? String(index);
        return [{
            id: `flood-alerts-france-${slug(stationId)}`,
            pluginId: "flood-alerts",
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp,
            label: stringFrom(raw.libelle_station ?? raw.name) ?? "Vigicrues station",
            properties: {
                ...raw,
                sourceScope: "france" as const,
                sourceName: "Vigicrues",
                eventType: "flood",
                country: "France",
                severity: severityFrom(raw.vigilance ?? raw.status ?? raw.niveau),
            },
        }];
    });
}

export function normalizePropluviaRestrictions(data: unknown): FeedEntity[] {
    return toArray(data).flatMap((raw, index) => {
        if (!isRecord(raw)) return [];
        const areaName = stringFrom(raw.nom ?? raw.name ?? raw.zone ?? raw.departement) ?? `Restriction ${index + 1}`;
        const regionKey = slug(stringFrom(raw.region ?? raw.nom_region ?? raw.area) ?? "");
        const coords = pickCoordinates(raw) ?? REGION_CENTROIDS[regionKey] ?? FRANCE_CENTROID;
        const timestamp = dateFrom(raw.date_debut ?? raw.date ?? raw.updated);
        return [{
            id: `drought-vegetation-france-${slug(areaName)}-${timestamp.getTime()}`,
            pluginId: "drought-vegetation",
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp,
            label: areaName,
            properties: {
                ...raw,
                sourceScope: "france" as const,
                sourceName: "Propluvia",
                eventType: "drought",
                country: "France",
                severity: severityFrom(raw.niveau_gravite ?? raw.level ?? raw.severity),
            },
        }];
    });
}

export function normalizeWhoDiseaseOutbreaks(data: unknown): FeedEntity[] {
    return toArray(data).flatMap((raw, index) => {
        if (!isRecord(raw)) return [];
        const entity = buildEntity(
            "disease-outbreaks",
            raw,
            index,
            { scope: "global", sourceName: "WHO" },
            "disease-outbreak",
        );
        return entity && !isFranceEntity(entity) ? [entity] : [];
    });
}

export function normalizeFranceDiseaseIndicators(data: unknown): FeedEntity[] {
    return normalizePointFeed(
        "disease-outbreaks",
        data,
        { scope: "france", sourceName: "Sante publique France" },
        "disease-outbreak",
    ).map((entity) => ({
        ...entity,
        properties: {
            ...entity.properties,
            country: "France",
        },
    }));
}

export function normalizeFirmsCsv(csv: string): FeedEntity[] {
    const [headerLine, ...rows] = csv.trim().split(/\r?\n/);
    if (!headerLine) return [];
    const headers = headerLine.split(",").map((header) => header.trim());
    return rows.flatMap((row, index) => {
        const values = row.split(",");
        const item = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]?.trim() ?? ""]));
        const latitude = numberFrom(item.latitude);
        const longitude = numberFrom(item.longitude);
        if (latitude === undefined || longitude === undefined) return [];
        const acqDate = item.acq_date;
        const acqTime = item.acq_time?.padStart(4, "0");
        const timestamp = dateFrom(acqDate && acqTime ? `${acqDate}T${acqTime.slice(0, 2)}:${acqTime.slice(2)}:00Z` : undefined);
        const confidence = item.confidence;
        const brightness = numberFrom(item.bright_ti4 ?? item.brightness);
        return [{
            id: `wildfire-hotspots-global-${slug(`${item.satellite || "sat"}-${item.latitude}-${item.longitude}-${item.acq_date}-${item.acq_time}-${index}`)}`,
            pluginId: "wildfire-hotspots",
            latitude,
            longitude,
            timestamp,
            label: `Thermal hotspot ${confidence ? `(${confidence})` : ""}`.trim(),
            properties: {
                ...item,
                sourceScope: "global" as const,
                sourceName: "NASA FIRMS",
                eventType: "wildfire-hotspot",
                severity: confidence,
                confidence,
                brightness,
                frp: numberFrom(item.frp),
                satellite: item.satellite,
            },
        }];
    });
}

export function normalizeEonetWildfires(data: unknown): FeedEntity[] {
    return toArray(data).flatMap((raw, index) => {
        if (!isRecord(raw)) return [];
        const geometry = Array.isArray(raw.geometry) ? raw.geometry[0] : raw.geometry;
        const eonetCoordinates = isRecord(geometry) && Array.isArray(geometry.coordinates)
            ? {
                longitude: numberFrom(geometry.coordinates[0]),
                latitude: numberFrom(geometry.coordinates[1]),
            }
            : null;
        const coords = eonetCoordinates?.latitude !== undefined && eonetCoordinates.longitude !== undefined
            ? { latitude: eonetCoordinates.latitude, longitude: eonetCoordinates.longitude }
            : isRecord(geometry) ? pickCoordinates(geometry) : pickCoordinates(raw);
        if (!coords) return [];
        const timestamp = dateFrom(isRecord(geometry) ? geometry.date : raw.date);
        const id = stringFrom(raw.id) ?? String(index);
        return [{
            id: `wildfire-hotspots-global-eonet-${slug(id)}`,
            pluginId: "wildfire-hotspots",
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp,
            label: stringFrom(raw.title) ?? "Wildfire event",
            properties: {
                ...raw,
                sourceScope: "global" as const,
                sourceName: "NASA EONET",
                eventType: "wildfire",
                severity: stringFrom(raw.status) ?? "active",
            },
        }];
    });
}

export function normalizeOpenAqLatest(data: unknown): FeedEntity[] {
    return toArray(data).flatMap((raw) => {
        if (!isRecord(raw)) return [];
        const coords = pickCoordinates(raw.coordinates && isRecord(raw.coordinates) ? raw.coordinates : raw);
        const measurements = Array.isArray(raw.measurements) ? raw.measurements : [];
        const measurement = measurements.find(isRecord) as Record<string, unknown> | undefined;
        if (!coords || !measurement) return [];
        const parameter = stringFrom(measurement.parameter) ?? "pm25";
        const value = numberFrom(measurement.value);
        const timestamp = dateFrom(measurement.lastUpdated ?? measurement.datetime ?? raw.datetime);
        const location = stringFrom(raw.location ?? raw.name) ?? "Air quality station";
        return [{
            id: `air-quality-global-${slug(stringFrom(raw.id) ?? location)}-${parameter}`,
            pluginId: "air-quality",
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp,
            label: `${location} ${parameter.toUpperCase()}`,
            properties: {
                ...raw,
                sourceScope: "global" as const,
                sourceName: "OpenAQ",
                eventType: "air-quality",
                station: location,
                city: stringFrom(raw.city),
                country: stringFrom(raw.country),
                parameter,
                value,
                unit: stringFrom(measurement.unit),
                severity: value,
            },
        }];
    });
}

export function normalizeOpenMeteoAirQuality(data: unknown): FeedEntity[] {
    return toArray(data).flatMap((raw, index) => {
        if (!isRecord(raw)) return [];
        const coords = pickCoordinates(raw);
        const current = isRecord(raw.current) ? raw.current : raw;
        const value = numberFrom(current.pm2_5 ?? current.pm25);
        if (!coords || value === undefined) return [];
        const timestamp = dateFrom(current.time ?? raw.time);
        const city = stringFrom(raw.city ?? raw.name) ?? `Open-Meteo AQ ${index + 1}`;
        return [{
            id: `air-quality-global-openmeteo-${slug(city)}`,
            pluginId: "air-quality",
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp,
            label: `${city} PM2.5`,
            properties: {
                ...raw,
                sourceScope: "global" as const,
                sourceName: "Open-Meteo Air Quality",
                eventType: "air-quality",
                station: city,
                city,
                parameter: "pm25",
                value,
                unit: "ug/m3",
                severity: value,
            },
        }];
    });
}

export function normalizeNdbcLatest(
    text: string,
    stations: Record<string, { name?: string; latitude: number; longitude: number }> = {},
): FeedEntity[] {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#YY"));
    return lines.flatMap((line) => {
        if (line.startsWith("#")) return [];
        const columns = line.trim().split(/\s+/);
        const [stationId, yy, mm, dd, hh, minute, windDir, windSpeed, gust, waveHeight, dominantPeriod, averagePeriod, meanWaveDir, pressure, airTemp, waterTemp] = columns;
        const station = stations[stationId];
        if (!stationId || !station) return [];
        const timestamp = dateFrom(`${yy}-${mm}-${dd}T${hh}:${minute}:00Z`);
        const stale = Date.now() - timestamp.getTime() > 6 * 60 * 60 * 1000;
        return [{
            id: `marine-buoys-global-${slug(stationId)}`,
            pluginId: "marine-buoys",
            latitude: station.latitude,
            longitude: station.longitude,
            timestamp,
            label: station.name ?? `NDBC ${stationId}`,
            properties: {
                sourceScope: "global" as const,
                sourceName: "NOAA NDBC",
                eventType: "marine-observation",
                stationId,
                stationName: station.name,
                windDirection: numberFrom(windDir),
                windSpeed: numberFrom(windSpeed),
                gust: numberFrom(gust),
                waveHeight: numberFrom(waveHeight),
                dominantPeriod: numberFrom(dominantPeriod),
                averagePeriod: numberFrom(averagePeriod),
                meanWaveDirection: numberFrom(meanWaveDir),
                pressure: numberFrom(pressure),
                airTemp: numberFrom(airTemp),
                waterTemp: numberFrom(waterTemp),
                severity: stale ? "stale" : "fresh",
                stale,
            },
        }];
    });
}

export function normalizeCelestrakSatellites(data: unknown, group = "active", now = new Date()): FeedEntity[] {
    return toArray(data).slice(0, 750).flatMap((raw, index) => {
        if (!isRecord(raw)) return [];
        const line1 = stringFrom(raw.TLE_LINE1 ?? raw.line1);
        const line2 = stringFrom(raw.TLE_LINE2 ?? raw.line2);
        const name = stringFrom(raw.OBJECT_NAME ?? raw.name ?? raw.OBJECT_ID) ?? `Satellite ${index + 1}`;
        try {
            const satrec = line1 && line2
                ? twoline2satrec(line1, line2)
                : json2satrec(raw as Parameters<typeof json2satrec>[0]);
            const positionAndVelocity = propagate(satrec, now);
            if (!positionAndVelocity?.position || typeof positionAndVelocity.position === "boolean") return [];
            const geodetic = eciToGeodetic(positionAndVelocity.position, gstime(now));
            const noradId = stringFrom(raw.NORAD_CAT_ID ?? raw.noradId ?? satrec.satnum);
            return [{
                id: `satellites-global-${slug(noradId ?? name)}`,
                pluginId: "satellites",
                latitude: geodetic.latitude * 180 / Math.PI,
                longitude: geodetic.longitude * 180 / Math.PI,
                altitude: geodetic.height * 1000,
                timestamp: now,
                label: name,
                properties: {
                    ...raw,
                    sourceScope: "global" as const,
                    sourceName: "CelesTrak",
                    eventType: "satellite",
                    orbitGroup: group,
                    noradId,
                    active: boolish(raw.OPS_STATUS_CODE) || group === "active",
                    severity: group,
                },
            }];
        } catch {
            return [];
        }
    });
}

export function normalizeGpsJamming(data: unknown): FeedEntity[] {
    return toArray(data).flatMap((raw, index) => {
        if (!isRecord(raw)) return [];
        const latitude = numberFrom(raw.lat ?? raw.latitude);
        const longitude = numberFrom(raw.lon ?? raw.lng ?? raw.longitude);
        if (latitude === undefined || longitude === undefined) return [];
        const level = stringFrom(raw.interferenceLevel ?? raw.level ?? raw.severity) ?? "unknown";
        const timestamp = dateFrom(raw.timestamp ?? raw.time ?? raw.updated);
        const id = stringFrom(raw.id) ?? `${latitude.toFixed(3)}-${longitude.toFixed(3)}-${index}`;
        const region = stringFrom(raw.region ?? raw.area ?? raw.location);
        return [{
            id: `gps-jamming-global-${slug(id)}`,
            pluginId: "gps-jamming",
            latitude,
            longitude,
            timestamp,
            label: region ? `${region} GPS interference` : `${level} GPS interference`,
            properties: {
                ...raw,
                sourceScope: "global" as const,
                sourceName: stringFrom(data && isRecord(data) ? data.source : undefined) ?? "GPSJam",
                eventType: "gps-jamming",
                interferenceLevel: level.toLowerCase(),
                region,
                severity: level.toLowerCase(),
            },
        }];
    });
}

export function normalizeNwsAlerts(data: unknown): FeedEntity[] {
    return toArray(data).flatMap((raw, index) => {
        if (!isRecord(raw)) return [];
        const properties = isRecord(raw.properties) ? raw.properties : raw;
        const coords = pickCoordinates(raw) ?? pickCoordinates(properties);
        if (!coords) return [];
        const timestamp = dateFrom(properties.effective ?? properties.sent);
        const id = stringFrom(properties.id ?? raw.id) ?? String(index);
        return [{
            id: `us-weather-alerts-us-${slug(id)}`,
            pluginId: "us-weather-alerts",
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp,
            label: stringFrom(properties.event) ?? "US weather alert",
            properties: {
                ...properties,
                sourceScope: "us" as const,
                sourceName: "NOAA/NWS",
                eventType: "weather-alert",
                country: "United States",
                area: stringFrom(properties.areaDesc),
                severity: severityFrom(properties.severity),
                urgency: stringFrom(properties.urgency),
                effective: stringFrom(properties.effective),
                expires: stringFrom(properties.expires),
                scopeLabel: "US only",
            },
        }];
    });
}

function dedupeKey(entity: GeoEntity): string {
    const eventType = String(entity.properties?.eventType ?? "");
    const day = entity.timestamp.toISOString().slice(0, 10);
    const lat = Math.round(entity.latitude * 10) / 10;
    const lon = Math.round(entity.longitude * 10) / 10;
    return `${eventType}:${day}:${lat}:${lon}`;
}

export function mergeAndDedupeEntities(globalItems: FeedEntity[], franceItems: FeedEntity[]): FeedEntity[] {
    const franceKeys = new Set(franceItems.map(dedupeKey));
    const filteredGlobal = globalItems.filter((entity) => {
        if (isFranceEntity(entity) && franceItems.length > 0) return false;
        return !franceKeys.has(dedupeKey(entity));
    });
    return [...filteredGlobal, ...franceItems];
}
