/**
 * Fetches FL511 traffic cameras from Florida's public ArcGIS FeatureServer.
 *
 * API: https://services.arcgis.com/3wFbqsFPLeKqOlIK/ArcGIS/rest/services/FL511_Traffic_Cameras/FeatureServer/0
 * Free, no authentication required. The layer exposes camera metadata and
 * snapshot URLs via ArcGIS JSON query pagination.
 */

import type { CameraFeature } from "../adapters/types";

const FL511_QUERY_URL = "https://services.arcgis.com/3wFbqsFPLeKqOlIK/ArcGIS/rest/services"
    + "/FL511_Traffic_Cameras/FeatureServer/0/query";

const PAGE_SIZE = 2000;

interface ArcGisFeature {
    attributes?: {
        OBJECTID_1?: number;
        ID?: string | null;
        DESCRIPT?: string | null;
        COUNTY?: string | null;
        HIGHWAY?: string | null;
        DIRECTION?: string | null;
        LATITUDE?: number | null;
        LONGITUDE?: number | null;
        TIMESTAMP?: string | null;
        IMAGE?: string | null;
    };
    geometry?: {
        x?: number;
        y?: number;
    };
}

interface ArcGisResponse {
    features?: ArcGisFeature[];
    exceededTransferLimit?: boolean;
}

function normalizeImageUrl(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^https:\/\//i.test(trimmed)) return trimmed;
    return null;
}

function toFeature(raw: ArcGisFeature): CameraFeature | null {
    const a = raw.attributes;
    if (!a) return null;

    const lat = typeof a.LATITUDE === "number" ? a.LATITUDE : raw.geometry?.y;
    const lon = typeof a.LONGITUDE === "number" ? a.LONGITUDE : raw.geometry?.x;
    if (typeof lat !== "number" || typeof lon !== "number") return null;

    const stream = normalizeImageUrl(a.IMAGE);
    if (!stream) return null;

    const id = a.ID || (typeof a.OBJECTID_1 === "number" ? String(a.OBJECTID_1) : undefined);
    const county = a.COUNTY?.trim() || "Florida";
    const highway = a.HIGHWAY?.trim() || "";
    const description = a.DESCRIPT?.trim() || [highway, county].filter(Boolean).join(" ");

    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
            id: id ? `fl511-${id}` : undefined,
            source: "fl511",
            stream,
            streamType: "image",
            hls: null,
            name: description || `FL511 camera ${id ?? ""}`.trim(),
            country: "United States",
            region: `${county} County, Florida`,
            city: county,
            route: highway,
            direction: a.DIRECTION?.trim() || "",
            location_description: description,
            categories: ["traffic"],
            extra: {
                fl511Id: a.ID,
                objectId: a.OBJECTID_1,
                lastUpdated: a.TIMESTAMP,
            },
        },
    };
}

export async function fetchFl511Cameras(): Promise<CameraFeature[]> {
    const all: CameraFeature[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const params = new URLSearchParams({
            where: "1=1",
            outFields: "OBJECTID_1,ID,DESCRIPT,COUNTY,HIGHWAY,DIRECTION,LATITUDE,LONGITUDE,TIMESTAMP,IMAGE",
            outSR: "4326",
            f: "json",
            returnGeometry: "true",
            resultRecordCount: String(PAGE_SIZE),
            resultOffset: String(offset),
        });

        const res = await fetch(`${FL511_QUERY_URL}?${params}`, {
            headers: { "User-Agent": "WorldWideView/1.0" },
        });
        if (!res.ok) throw new Error(`FL511 API returned ${res.status}`);

        const json = (await res.json()) as ArcGisResponse;
        const features = json.features ?? [];
        for (const feature of features) {
            const converted = toFeature(feature);
            if (converted) all.push(converted);
        }

        hasMore = json.exceededTransferLimit === true && features.length > 0;
        offset += features.length;
    }

    return all;
}
