import {
    Activity,
    BellRing,
    Leaf,
    Radio,
    RadioTower,
    Satellite,
    ThermometerSun,
    Waves,
} from "lucide-react";
import type {
    CesiumEntityOptions,
    GeoEntity,
    LayerConfig,
    PluginContext,
    WorldPlugin,
} from "@/core/plugins/PluginTypes";
import { dataBus } from "@/core/data/DataBus";
import { BUILT_IN_GLOBAL_FEED_IDS, type FeedResponse, type GlobalFeedId } from "./types";

const FEED_META: Record<GlobalFeedId, {
    name: string;
    description: string;
    color: string;
    icon: WorldPlugin["icon"];
    category?: WorldPlugin["category"];
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
    "wildfire-hotspots": {
        name: "Wildfire Hotspots",
        description: "NASA FIRMS thermal hotspots, with NASA EONET wildfire fallback when no free FIRMS key is configured.",
        color: "#f43f5e",
        icon: ThermometerSun,
    },
    "air-quality": {
        name: "Air Quality Stations",
        description: "OpenAQ latest station readings with a no-key Open-Meteo PM2.5 fallback grid.",
        color: "#84cc16",
        icon: Radio,
        category: "weather",
    },
    "marine-buoys": {
        name: "Marine Buoys",
        description: "NOAA NDBC latest ocean station observations for wind, waves, pressure, and water temperature.",
        color: "#06b6d4",
        icon: Waves,
        category: "maritime",
    },
    satellites: {
        name: "Satellite Constellations",
        description: "CelesTrak GP data propagated to current approximate positions for stations, weather, and Starlink groups.",
        color: "#a78bfa",
        icon: Satellite,
        category: "space",
    },
    "us-weather-alerts": {
        name: "US Weather Alerts",
        description: "NOAA/NWS active alert centroids for current watches and warnings. Scope: US only.",
        color: "#f59e0b",
        icon: BellRing,
        category: "weather",
    },
};

function severityColor(entity: GeoEntity, fallback: string): string {
    const severity = String(entity.properties?.severity ?? "").toLowerCase();
    const parameter = String(entity.properties?.parameter ?? "").toLowerCase();
    const numericSeverity = Number(entity.properties?.severity ?? entity.properties?.value ?? entity.properties?.brightness);
    if (parameter.includes("pm") && Number.isFinite(numericSeverity)) {
        if (numericSeverity > 55) return "#7f1d1d";
        if (numericSeverity > 35) return "#dc2626";
        if (numericSeverity > 12) return "#f59e0b";
        return "#22c55e";
    }
    if (String(entity.properties?.eventType) === "wildfire-hotspot" && Number.isFinite(numericSeverity)) {
        if (numericSeverity > 330) return "#ef4444";
        if (numericSeverity > 300) return "#f97316";
        return "#f59e0b";
    }
    if (["red", "rouge", "4", "extreme", "severe"].some((value) => severity.includes(value))) return "#ef4444";
    if (["orange", "3", "high"].some((value) => severity.includes(value))) return "#f97316";
    if (["yellow", "jaune", "2", "medium", "moderate"].some((value) => severity.includes(value))) return "#eab308";
    if (["green", "vert", "1", "low"].some((value) => severity.includes(value))) return "#22c55e";
    return fallback;
}

/**
 * Creates a composite global feed plugin that merges global + France sources.
 *
 * @param id - Global feed identifier.
 * @returns A WorldPlugin definition wired to the global feeds API.
 */
export function createGlobalFeedPlugin(id: GlobalFeedId): WorldPlugin {
    const meta = FEED_META[id];
    let context: PluginContext | null = null;

    return {
        id,
        name: meta.name,
        description: meta.description,
        icon: meta.icon,
        category: meta.category ?? "natural-disaster",
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
            if (Array.isArray(body.sources)) {
                dataBus.emit("sourceHealthChanged", {
                    pluginId: id,
                    patch: {
                        sourceName: meta.name,
                        sourceUrl: `/api/feeds/${id}`,
                        sourceType: "composite",
                        sources: body.sources,
                    },
                });
            }
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

        getServerConfig() {
            return {
                apiBasePath: `/api/feeds/${id}`,
                pollingIntervalMs: 5 * 60 * 1000,
                transportMode: "polling" as const,
                sourceName: meta.name,
                sourceUrl: `/api/feeds/${id}`,
                doctor: {
                    enabled: true,
                    probePath: `/api/feeds/${id}`,
                    expectedShape: "items" as const,
                },
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
