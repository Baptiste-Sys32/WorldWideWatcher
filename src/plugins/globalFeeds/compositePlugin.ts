import {
    Activity,
    Leaf,
    RadioTower,
    Waves,
} from "lucide-react";
import type {
    CesiumEntityOptions,
    GeoEntity,
    LayerConfig,
    PluginContext,
    WorldPlugin,
} from "@/core/plugins/PluginTypes";
import { BUILT_IN_GLOBAL_FEED_IDS, type FeedResponse, type GlobalFeedId } from "./types";

const FEED_META: Record<GlobalFeedId, {
    name: string;
    description: string;
    color: string;
    icon: WorldPlugin["icon"];
}> = {
    "tropical-cyclones": {
        name: "Tropical Cyclones",
        description: "Global tropical cyclone events with France territory alerts piggybacked.",
        color: "#f97316",
        icon: RadioTower,
    },
    "flood-alerts": {
        name: "Flood Alerts",
        description: "Global flood events merged with Vigicrues hydrometry stations in France.",
        color: "#0ea5e9",
        icon: Waves,
    },
    "drought-vegetation": {
        name: "Drought / Vegetation Stress",
        description: "Global drought and vegetation stress markers merged with French water restrictions.",
        color: "#a16207",
        icon: Leaf,
    },
    "disease-outbreaks": {
        name: "Disease Outbreaks",
        description: "WHO disease outbreak markers merged with France public health indicators.",
        color: "#dc2626",
        icon: Activity,
    },
};

function severityColor(entity: GeoEntity, fallback: string): string {
    const severity = String(entity.properties?.severity ?? "").toLowerCase();
    if (["red", "rouge", "4", "extreme", "severe"].some((value) => severity.includes(value))) return "#ef4444";
    if (["orange", "3", "high"].some((value) => severity.includes(value))) return "#f97316";
    if (["yellow", "jaune", "2", "medium", "moderate"].some((value) => severity.includes(value))) return "#eab308";
    if (["green", "vert", "1", "low"].some((value) => severity.includes(value))) return "#22c55e";
    return fallback;
}

export function createGlobalFeedPlugin(id: GlobalFeedId): WorldPlugin {
    const meta = FEED_META[id];
    let context: PluginContext | null = null;

    return {
        id,
        name: meta.name,
        description: meta.description,
        icon: meta.icon,
        category: "natural-disaster",
        version: "1.0.0",

        async initialize(ctx: PluginContext): Promise<void> {
            context = ctx;
        },

        destroy(): void {
            context = null;
        },

        async fetch(): Promise<GeoEntity[]> {
            const baseUrl = typeof window !== "undefined"
                ? window.location.origin
                : context?.apiBaseUrl ?? "";
            const response = await fetch(`${baseUrl}/api/feeds/${id}`);
            if (!response.ok) {
                throw new Error(`${meta.name} feed returned HTTP ${response.status}`);
            }
            const body = await response.json() as Partial<FeedResponse>;
            return Array.isArray(body.items)
                ? body.items.map((entity) => ({ ...entity, pluginId: id, timestamp: new Date(entity.timestamp) }))
                : [];
        },

        getPollingInterval(): number {
            return 5 * 60 * 1000;
        },

        getLayerConfig(): LayerConfig {
            return {
                color: meta.color,
                clusterEnabled: true,
                clusterDistance: 55,
                maxEntities: 5_000,
            };
        },

        renderEntity(entity: GeoEntity): CesiumEntityOptions {
            const color = severityColor(entity, meta.color);
            return {
                type: "point",
                color,
                outlineColor: entity.properties?.sourceScope === "france" ? "#ffffff" : "#0f172a",
                outlineWidth: 1,
                size: entity.properties?.sourceScope === "france" ? 9 : 7,
                labelText: entity.label,
                disableDepthTestDistance: 2_000_000,
            };
        },
    };
}

export const globalFeedPlugins = BUILT_IN_GLOBAL_FEED_IDS.map(createGlobalFeedPlugin);
