// @vitest-environment node
import {
    beforeEach, describe, expect, it, vi
} from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/weather/tile/[z]/[x]/[y]/route";

function makeRequest(layer: string | null, z = "3", x = "4", y = "2") {
    const url = new URL(`http://localhost/api/weather/tile/${z}/${x}/${y}`);
    if (layer !== null) url.searchParams.set("layer", layer);
    return {
        req: new NextRequest(url),
        params: Promise.resolve({ z, x, y }),
    };
}

const openMeteoBody = {
    current: {
        temperature_2m: Array.from({ length: 16 }, (_, index) => 10 + index),
        precipitation: Array.from({ length: 16 }, (_, index) => index / 10),
        cloud_cover: Array.from({ length: 16 }, (_, index) => index * 6),
        wind_speed_10m: Array.from({ length: 16 }, (_, index) => index + 1),
        wind_direction_10m: Array.from({ length: 16 }, (_, index) => index * 10),
    },
};

const openMeteoTemperatureBody = {
    current: {
        temperature_2m: Array.from({ length: 64 }, (_, index) => -20 + index),
    },
};

const rainViewerManifest = {
    host: "https://tilecache.rainviewer.com",
    radar: {
        past: [
            { time: 100, path: "/v2/radar/100" },
            { time: 200, path: "/v2/radar/200" },
        ],
    },
};

describe("/api/weather/tile/[z]/[x]/[y]", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("proxies OpenWeatherMap raster tiles when a free API key is configured", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "free-key");
        const mockFetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "Content-Type": "image/png" },
        }));
        vi.stubGlobal("fetch", mockFetch);

        const { req, params } = makeRequest("weather-wind", "5", "10", "12");
        const response = await GET(req, { params });

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/png");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

        const calledUrl = String(mockFetch.mock.calls[0][0]);
        expect(calledUrl).toBe("https://tile.openweathermap.org/map/wind_new/5/10/12.png?appid=free-key");
    });

    it("renders a valid tile request as SVG when no API key is configured", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "");
        vi.stubGlobal("fetch", vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ radar: { past: [] } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => openMeteoBody,
            }));

        const { req, params } = makeRequest("weather-precipitation");
        const response = await GET(req, { params });

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");

        const body = await response.text();
        expect(body).toContain("<svg");
        expect(body).toContain("Precipitation - Open-Meteo");
    });

    it("uses RainViewer radar tiles for precipitation", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "free-key");
        const mockFetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => rainViewerManifest,
            })
            .mockResolvedValueOnce(new Response(new Uint8Array([8, 9, 10]), {
                status: 200,
                headers: { "Content-Type": "image/png" },
            }));
        vi.stubGlobal("fetch", mockFetch);

        const { req, params } = makeRequest("weather-precipitation", "5", "10", "12");
        const response = await GET(req, { params });

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/png");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([8, 9, 10]));
        expect(String(mockFetch.mock.calls[0][0])).toBe("https://api.rainviewer.com/public/weather-maps.json");
        expect(String(mockFetch.mock.calls[1][0])).toBe("https://tilecache.rainviewer.com/v2/radar/200/256/5/10/12/2/1_1.png");
    });

    it("uses OpenWeatherMap temperature tiles when a free API key is configured", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "free-key");
        const mockFetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([4, 5, 6]), {
            status: 200,
            headers: { "Content-Type": "image/png" },
        }));
        vi.stubGlobal("fetch", mockFetch);

        const { req, params } = makeRequest("weather-temperature", "2", "1", "1");
        const response = await GET(req, { params });

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/png");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]));
        expect(String(mockFetch.mock.calls[0][0])).toBe("https://tile.openweathermap.org/map/temp_new/2/1/1.png?appid=free-key");
    });

    it("renders temperature as a smoothed heat-map skin when no API key is configured", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "");
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => openMeteoTemperatureBody,
        });
        vi.stubGlobal("fetch", mockFetch);

        const { req, params } = makeRequest("weather-temperature");
        const response = await GET(req, { params });
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
        expect(body).toContain("temperature-smooth");
        expect(body).toContain("feGaussianBlur");
        expect(String(mockFetch.mock.calls[0][0])).toContain("current=temperature_2m");
    });

    it("uses Open-Meteo as a fallback when the raster provider fails", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "free-key");
        const mockFetch = vi
            .fn()
            .mockResolvedValueOnce(new Response("nope", { status: 500 }))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => openMeteoBody,
            });
        vi.stubGlobal("fetch", mockFetch);

        const { req, params } = makeRequest("weather-clouds");
        const response = await GET(req, { params });

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(String(mockFetch.mock.calls[0][0])).toContain("tile.openweathermap.org/map/clouds_new");
        expect(String(mockFetch.mock.calls[1][0])).toContain("https://api.open-meteo.com/v1/forecast?");
    });

    it("passes correct Open-Meteo URL to upstream without an API key", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "");
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => openMeteoBody,
        });
        vi.stubGlobal("fetch", mockFetch);

        const { req, params } = makeRequest("weather-wind", "5", "10", "12");
        await GET(req, { params });

        const calledUrl = String(mockFetch.mock.calls[0][0]);
        expect(calledUrl).toContain("https://api.open-meteo.com/v1/forecast?");
        expect(calledUrl).toContain("current=wind_speed_10m%2Cwind_direction_10m");
        expect(calledUrl).not.toContain("appid");
    });

    it("rejects invalid input before hitting upstream", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "free-key");
        const mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        expect((await GET(makeRequest(null).req, { params: makeRequest(null).params })).status).toBe(400);
        expect((await GET(makeRequest("bad-layer").req, { params: makeRequest("bad-layer").params })).status).toBe(400);
        expect((await GET(makeRequest("weather-clouds", "-1", "0", "0").req, {
            params: makeRequest("weather-clouds", "-1", "0", "0").params,
        })).status).toBe(400);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns 502 when upstream fails", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

        const { req, params } = makeRequest("weather-temperature");
        const response = await GET(req, { params });
        const json = await response.json();

        expect(response.status).toBe(502);
        expect(json.error).toBe("Failed to fetch weather data");
    });
});
