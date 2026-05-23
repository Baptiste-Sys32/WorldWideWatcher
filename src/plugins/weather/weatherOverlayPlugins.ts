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

export const WEATHER_OVERLAY_PLUGIN_IDS = [
    "weather-temperature",
    "weather-precipitation",
    "weather-clouds",
    "weather-wind",
] as const;

export type WeatherOverlayPluginId = (typeof WEATHER_OVERLAY_PLUGIN_IDS)[number];

export const WEATHER_OVERLAY_LABELS: Record<WeatherOverlayPluginId, string> = {
    "weather-temperature": "Temperature",
    "weather-precipitation": "Precipitation",
    "weather-clouds": "Clouds",
    "weather-wind": "Wind",
};

const WEATHER_PLUGIN_META: Array<{
    id: WeatherOverlayPluginId;
    name: string;
    description: string;
    color: string;
    icon: typeof Thermometer;
}> = [
    {
        id: "weather-temperature",
        name: "Temperature",
        description: "Current global 2 m temperature overlay.",
        color: "#f97316",
        icon: Thermometer,
    },
    {
        id: "weather-precipitation",
        name: "Precipitation",
        description: "Current rain and snow intensity overlay.",
        color: "#38bdf8",
        icon: CloudRain,
    },
    {
        id: "weather-clouds",
        name: "Clouds",
        description: "Current cloud cover overlay.",
        color: "#cbd5e1",
        icon: Cloud,
    },
    {
        id: "weather-wind",
        name: "Wind",
        description: "Current 10 m wind speed and direction overlay.",
        color: "#2dd4bf",
        icon: Wind,
    },
];

function makeWeatherPlugin(meta: (typeof WEATHER_PLUGIN_META)[number]): WorldPlugin {
    return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        icon: meta.icon,
        category: "weather",
        version: "1.0.0",
        async initialize() {},
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
            sourceName: "OpenWeatherMap / Open-Meteo",
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
