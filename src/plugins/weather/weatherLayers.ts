export interface WeatherLegendItem {
    label: string;
    color: string;
}

export interface WeatherLayerMeta {
    id: "weather-temperature" | "weather-precipitation" | "weather-clouds" | "weather-wind";
    name: string;
    description: string;
    providerLabel: string;
    legend: WeatherLegendItem[];
    opacity: number;
    freshnessLabel: string;
}

export const WEATHER_TILE_URL_TEMPLATE = "/api/weather/tile/{z}/{x}/{y}?layer={layer}";

export const WEATHER_LAYERS = [
    {
        id: "weather-temperature",
        name: "Temperature",
        description: "Current 2 m temperature overlay",
        providerLabel: "OpenWeatherMap tiles (fallback Open-Meteo)",
        legend: [
            { label: "<= -5 C", color: "#6baed6" },
            { label: "0-15 C", color: "#fff7bc" },
            { label: "15-25 C", color: "#fec44f" },
            { label: ">= 35 C", color: "#99000d" },
        ],
        opacity: 0.94,
        freshnessLabel: "Updated every 10-15 min",
    },
    {
        id: "weather-precipitation",
        name: "Precipitation",
        description: "Current rain and snow intensity overlay",
        providerLabel: "RainViewer radar (fallback Open-Meteo)",
        legend: [
            { label: "Light", color: "rgba(39, 174, 96, 0.68)" },
            { label: "Moderate", color: "rgba(252, 211, 77, 0.9)" },
            { label: "Heavy", color: "rgba(249, 115, 22, 0.95)" },
            { label: "Extreme", color: "rgba(220, 38, 38, 0.98)" },
        ],
        opacity: 1,
        freshnessLabel: "Updated every 5-10 min",
    },
    {
        id: "weather-clouds",
        name: "Clouds",
        description: "Current cloud cover overlay",
        providerLabel: "OpenWeatherMap tiles (fallback Open-Meteo)",
        legend: [
            { label: "Thin", color: "rgba(226, 232, 240, 0.2)" },
            { label: "Broken", color: "rgba(226, 232, 240, 0.4)" },
            { label: "Overcast", color: "rgba(226, 232, 240, 0.6)" },
        ],
        opacity: 0.78,
        freshnessLabel: "Updated every 10-15 min",
    },
    {
        id: "weather-wind",
        name: "Wind",
        description: "Current 10 m wind speed and direction overlay",
        providerLabel: "OpenWeatherMap tiles (fallback Open-Meteo)",
        legend: [
            { label: "Calm", color: "rgba(125, 211, 252, 0.28)" },
            { label: "Breezy", color: "rgba(45, 212, 191, 0.42)" },
            { label: "Windy", color: "rgba(250, 204, 21, 0.5)" },
            { label: "Strong", color: "rgba(248, 113, 113, 0.58)" },
        ],
        opacity: 0.78,
        freshnessLabel: "Updated every 10-15 min",
    },
] as const satisfies readonly WeatherLayerMeta[];

export type WeatherLayerId = (typeof WEATHER_LAYERS)[number]["id"];

export const WEATHER_LAYER_META_BY_ID = WEATHER_LAYERS.reduce((acc, layer) => {
    acc[layer.id] = layer;
    return acc;
}, {} as Record<WeatherLayerId, WeatherLayerMeta>);
