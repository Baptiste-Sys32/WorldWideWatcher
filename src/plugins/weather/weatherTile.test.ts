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

const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("/api/weather/tile/[z]/[x]/[y]", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "test-key-123");
    });

    it("proxies a valid tile request and returns PNG", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => fakePng.buffer,
        }));

        const { req, params } = makeRequest("precipitation_new");
        const response = await GET(req, { params });

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/png");

        const body = new Uint8Array(await response.arrayBuffer());
        expect(body[0]).toBe(0x89);
        expect(body[1]).toBe(0x50);
    });

    it("passes correct URL to upstream", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => fakePng.buffer,
        });
        vi.stubGlobal("fetch", mockFetch);

        const { req, params } = makeRequest("wind_new", "5", "10", "12");
        await GET(req, { params });

        expect(mockFetch).toHaveBeenCalledWith(
            "https://tile.openweathermap.org/map/wind_new/5/10/12.png?appid=test-key-123",
            expect.objectContaining({
                headers: { "User-Agent": "WorldWideView/1.0" },
            }),
        );
    });

    it("rejects invalid input before hitting upstream", async () => {
        const mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        expect((await GET(makeRequest(null).req, { params: makeRequest(null).params })).status).toBe(400);
        expect((await GET(makeRequest("bad-layer").req, { params: makeRequest("bad-layer").params })).status).toBe(400);
        expect((await GET(makeRequest("clouds_new", "-1", "0", "0").req, {
            params: makeRequest("clouds_new", "-1", "0", "0").params,
        })).status).toBe(400);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns 503 when API key is not configured", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "");

        const { req, params } = makeRequest("clouds_new");
        const response = await GET(req, { params });
        const json = await response.json();

        expect(response.status).toBe(503);
        expect(json.error).toBe("Weather API not configured");
    });

    it("returns 502 when upstream fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

        const { req, params } = makeRequest("temp_new");
        const response = await GET(req, { params });
        const json = await response.json();

        expect(response.status).toBe(502);
        expect(json.error).toBe("Failed to fetch weather tile");
    });
});
