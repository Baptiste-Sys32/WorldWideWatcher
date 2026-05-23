import type { GeoEntity } from "@/core/plugins/PluginTypes";

export type SourceScope = "global" | "france";

export type GlobalFeedId =
    | "tropical-cyclones"
    | "flood-alerts"
    | "drought-vegetation"
    | "disease-outbreaks";

export const BUILT_IN_GLOBAL_FEED_IDS = [
    "tropical-cyclones",
    "flood-alerts",
    "drought-vegetation",
    "disease-outbreaks",
] as const satisfies readonly GlobalFeedId[];

export interface SourceMeta {
    scope: SourceScope;
    sourceName: string;
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
}
