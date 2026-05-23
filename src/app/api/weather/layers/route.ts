import { NextResponse } from "next/server";
import { WEATHER_LAYERS } from "@/plugins/weather/weatherLayers";

export const revalidate = 3600;

export async function GET() {
    const usesApiKey = Boolean(process.env.OPENWEATHERMAP_API_KEY?.trim());

    return NextResponse.json({
        configured: true,
        provider: usesApiKey ? "RainViewer / OpenWeatherMap / Open-Meteo" : "RainViewer / Open-Meteo",
        requiresApiKey: false,
        usesApiKey,
        freeTier: true,
        fallbackProvider: "Open-Meteo",
        tileUrlTemplate: "/api/weather/tile/{z}/{x}/{y}?layer={layer}",
        layers: WEATHER_LAYERS,
    });
}
