import {
    Cloud,
    CloudRain,
    Thermometer,
    Wind,
} from "lucide-react";
import { pluginRegistry } from "@/core/plugins/PluginRegistry";
import type {
    CesiumEntityOptions,
    GeoEntity,
    TimeRange,
    WorldPlugin,
} from "@/core/plugins/PluginTypes";
import {
    WEATHER_LAYER_META_BY_ID,
    WEATHER_LAYERS,
    type WeatherLayerId,
} from "./weatherLayers";
import { dataBus } from "@/core/data/DataBus";

export const WEATHER_OVERLAY_PLUGIN_IDS = WEATHER_LAYERS.map((layer) => layer.id) as WeatherLayerId[];

export type WeatherOverlayPluginId = WeatherLayerId;

export const WEATHER_OVERLAY_LABELS = Object.fromEntries(
    WEATHER_LAYERS.map((layer) => [layer.id, layer.name]),
) as Record<WeatherOverlayPluginId, string>;

const WEATHER_VISUALS: Record<WeatherLayerId, { color: string; icon: typeof Thermometer }> = {
    "weather-temperature": {
        color: "#f97316",
        icon: Thermometer,
    },
    "weather-precipitation": {
        color: "#38bdf8",
        icon: CloudRain,
    },
    "weather-clouds": {
        color: "#cbd5e1",
        icon: Cloud,
    },
    "weather-wind": {
        color: "#2dd4bf",
        icon: Wind,
    },
};

const WEATHER_PLUGIN_META: Array<{
    id: WeatherOverlayPluginId;
    name: string;
    description: string;
    color: string;
    icon: typeof Thermometer;
}> = WEATHER_LAYERS.map((layer) => ({
    id: layer.id,
    name: layer.name,
    description: layer.description,
    color: WEATHER_VISUALS[layer.id].color,
    icon: WEATHER_VISUALS[layer.id].icon,
}));

/**
 * Builds a weather overlay plugin definition from metadata.
 *
 * @param meta - Weather layer metadata including labels and rendering color.
 * @returns A WorldPlugin that renders a weather imagery overlay.
 */
function makeWeatherPlugin(meta: (typeof WEATHER_PLUGIN_META)[number]): WorldPlugin {
    const layerMeta = WEATHER_LAYER_META_BY_ID[meta.id];
    return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        icon: meta.icon,
        category: "weather",
        version: "1.0.0",
        async initialize() {
            dataBus.emit("sourceHealthChanged", {
                pluginId: meta.id,
                patch: {
                    status: "idle",
                    sourceName: layerMeta?.providerLabel ?? "Weather tile proxy",
                    sourceType: "static",
                    sourceUrl: "/api/weather/layers",
                    itemCount: 0,
                },
            });
            try {
                const started = performance.now();
                dataBus.emit("sourceHealthChanged", {
                    pluginId: meta.id,
                    patch: { status: "loading", lastAttemptAt: Date.now() },
                });
                const response = await fetch("/api/weather/layers");
                if (!response.ok) throw new Error(`Weather layers returned HTTP ${response.status}`);
                const body = await response.json() as {
                    provider?: string;
                    usesApiKey?: boolean;
                    diagnostics?: { message?: string };
                };
                dataBus.emit("sourceHealthChanged", {
                    pluginId: meta.id,
                    patch: {
                        status: "healthy",
                        sourceName: body.provider ?? layerMeta?.providerLabel ?? "Weather tile proxy",
                        sourceType: "static",
                        sourceUrl: "/api/weather/layers",
                        lastSuccessAt: Date.now(),
                        latencyMs: Math.round(performance.now() - started),
                        fallbackActive: !body.usesApiKey,
                        lastErrorMessage: body.diagnostics?.message ?? null,
                        sources: [{
                            sourceName: body.usesApiKey ? "OpenWeatherMap tile proxy" : "Open-Meteo/RainViewer fallback",
                            scope: meta.id,
                            ok: true,
                            count: 0,
                            latencyMs: Math.round(performance.now() - started),
                        }],
                    },
                });
            } catch (error) {
                dataBus.emit("sourceHealthChanged", {
                    pluginId: meta.id,
                    patch: {
                        status: "error",
                        sourceName: layerMeta?.providerLabel ?? "Weather tile proxy",
                        sourceType: "static",
                        sourceUrl: "/api/weather/layers",
                        lastErrorAt: Date.now(),
                        lastErrorMessage: error instanceof Error ? error.message : String(error),
                    },
                });
            }
        },
        destroy() {},
        async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
            return [];
        },
        getPollingInterval: () => 0,
        getLayerConfig: () => ({
            color: meta.color,
            clusterEnabled: false,
            clusterDistance: 0,
            disableDefaultRendering: true,
        }),
        renderEntity(): CesiumEntityOptions {
            return { type: "point", color: meta.color };
        },
        getServerConfig: () => ({
            apiBasePath: "/api/weather",
            pollingIntervalMs: 0,
            transportMode: "static",
            sourceName: layerMeta?.providerLabel ?? "OpenWeatherMap / Open-Meteo",
            sourceUrl: "/api/weather/layers",
            doctor: {
                enabled: true,
                probePath: "/api/weather/layers",
                expectedShape: "object",
            },
        }),
    };
}

for (const meta of WEATHER_PLUGIN_META) {
    pluginRegistry.register(makeWeatherPlugin(meta));
}
