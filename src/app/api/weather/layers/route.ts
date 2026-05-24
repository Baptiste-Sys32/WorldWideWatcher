import { NextResponse } from "next/server";
import { WEATHER_LAYERS, WEATHER_TILE_URL_TEMPLATE } from "@/plugins/weather/weatherLayers";

export const revalidate = 3600;

/**
 * Returns the catalog of supported weather overlay layers and provider metadata.
 *
 * @returns JSON describing weather layer availability and tile template.
 */
export async function GET() {
    const usesApiKey = Boolean(process.env.OPENWEATHERMAP_API_KEY?.trim());

    return NextResponse.json({
        configured: true,
        provider: usesApiKey ? "RainViewer / OpenWeatherMap / Open-Meteo" : "RainViewer / Open-Meteo",
        requiresApiKey: false,
        usesApiKey,
        freeTier: true,
        fallbackProvider: "Open-Meteo",
        diagnostics: {
            ok: true,
            status: usesApiKey ? "openweathermap-configured" : "openweathermap-key-missing",
            message: usesApiKey
                ? "OpenWeatherMap key is configured; tile proxy can use OpenWeatherMap before fallback."
                : "OPENWEATHERMAP_API_KEY is missing; tile proxy uses RainViewer/Open-Meteo fallback sources.",
        },
        tileUrlTemplate: WEATHER_TILE_URL_TEMPLATE,
        layers: WEATHER_LAYERS,
    });
}
