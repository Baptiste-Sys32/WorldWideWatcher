// @vitest-environment node
import {
    beforeEach, describe, expect, it, vi
} from "vitest";
import { GET } from "@/app/api/weather/layers/route";

describe("/api/weather/layers", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("returns OpenWeatherMap layers when a free API key is configured", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "free-key");

        const response = await GET();
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.configured).toBe(true);
        expect(json.requiresApiKey).toBe(false);
        expect(json.usesApiKey).toBe(true);
        expect(json.freeTier).toBe(true);
        expect(json.provider).toBe("RainViewer / OpenWeatherMap / Open-Meteo");
        expect(json.fallbackProvider).toBe("Open-Meteo");
        expect(json.tileUrlTemplate).toBe("/api/weather/tile/{z}/{x}/{y}?layer={layer}");
        expect(json.layers.map((layer: { id: string }) => layer.id)).toEqual([
            "weather-temperature",
            "weather-precipitation",
            "weather-clouds",
            "weather-wind",
        ]);
        json.layers.forEach((layer: {
            providerLabel?: string;
            legend?: unknown[];
            opacity?: number;
            freshnessLabel?: string;
        }) => {
            expect(layer.providerLabel).toBeTruthy();
            expect(Array.isArray(layer.legend)).toBe(true);
            expect(layer.legend?.length).toBeGreaterThan(0);
            expect(typeof layer.opacity).toBe("number");
            expect(layer.freshnessLabel).toBeTruthy();
        });
    });

    it("falls back to no-key Open-Meteo layers without an API key", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "");

        const response = await GET();
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.configured).toBe(true);
        expect(json.requiresApiKey).toBe(false);
        expect(json.usesApiKey).toBe(false);
        expect(json.provider).toBe("RainViewer / Open-Meteo");
        expect(json.tileUrlTemplate).toBe("/api/weather/tile/{z}/{x}/{y}?layer={layer}");
        expect(json.layers.map((layer: { id: string }) => layer.id)).toEqual([
            "weather-temperature",
            "weather-precipitation",
            "weather-clouds",
            "weather-wind",
        ]);
        json.layers.forEach((layer: {
            providerLabel?: string;
            legend?: unknown[];
            opacity?: number;
            freshnessLabel?: string;
        }) => {
            expect(layer.providerLabel).toBeTruthy();
            expect(Array.isArray(layer.legend)).toBe(true);
            expect(layer.legend?.length).toBeGreaterThan(0);
            expect(typeof layer.opacity).toBe("number");
            expect(layer.freshnessLabel).toBeTruthy();
        });
    });
});
