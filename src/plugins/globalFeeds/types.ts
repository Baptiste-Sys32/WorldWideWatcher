import type { GeoEntity } from "@/core/plugins/PluginTypes";

export type SourceScope = "global" | "france" | "us";

export type GlobalFeedId =
    | "tropical-cyclones"
    | "flood-alerts"
    | "drought-vegetation"
    | "disease-outbreaks"
    | "volcanic-ash-advisories"
    | "power-outages"
    | "wildfire-hotspots"
    | "air-quality"
    | "marine-buoys"
    | "satellites"
    | "gps-jamming"
    | "us-weather-alerts";

export const BUILT_IN_GLOBAL_FEED_IDS = [
    "tropical-cyclones",
    "flood-alerts",
    "drought-vegetation",
    "disease-outbreaks",
    "volcanic-ash-advisories",
    "power-outages",
    "wildfire-hotspots",
    "air-quality",
    "marine-buoys",
    "satellites",
    "gps-jamming",
    "us-weather-alerts",
] as const satisfies readonly GlobalFeedId[];

export interface SourceMeta {
    scope: SourceScope;
    sourceName: string;
}

export interface FeedSourceAudit {
    sourceName: string;
    scope: SourceScope | string;
    ok: boolean;
    count: number;
    errorMessage?: string;
    latencyMs?: number;
}

export type FeedEntity = GeoEntity & {
    properties: GeoEntity["properties"] & {
        sourceScope: SourceScope;
        sourceName: string;
        eventType?: string;
        country?: string;
        severity?: string | number;
    };
};

export interface FeedResponse {
    items: FeedEntity[];
    sources?: FeedSourceAudit[];
}
