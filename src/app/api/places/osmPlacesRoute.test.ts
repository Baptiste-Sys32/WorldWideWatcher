// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET as searchGET } from "./search/route";
import { GET as detailsGET } from "./details/route";

function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
        ok,
        status,
        json: async () => body,
    };
}

describe("OSM places routes", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        delete process.env.NOMINATIM_BASE_URL;
    });

    it("uses a configured Nominatim base URL", async () => {
        process.env.NOMINATIM_BASE_URL = "https://geocoder.example.test/nominatim/";
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));

        const response = await searchGET(new Request("http://localhost/api/places/search?input=custom-base-url"));

        expect(response.status).toBe(200);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining("https://geocoder.example.test/nominatim/search"), expect.any(Object));
    });

    it("reports provider failures for address lookup", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "rate limited" }, false, 429)));

        const response = await searchGET(new Request("http://localhost/api/places/search?input=rate-limit-case"));
        const json = await response.json();

        expect(response.status).toBe(502);
        expect(json.error).toBe("Failed to fetch address predictions");
    });

    it("returns Nominatim search predictions without API keys", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{
            osm_type: "node",
            osm_id: 123,
            lat: "48.8584",
            lon: "2.2945",
            display_name: "Eiffel Tower, Paris, France",
            category: "tourism",
            type: "attraction",
            addresstype: "tourism",
        }])));

        const response = await searchGET(new Request("http://localhost/api/places/search?input=eiffel"));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining("nominatim.openstreetmap.org/search"), expect.objectContaining({
            headers: expect.objectContaining({ "User-Agent": expect.stringContaining("WorldWideView") }),
        }));
        expect(json.predictions).toEqual([
            expect.objectContaining({
                placeId: "osm:node:123",
                mainText: "Eiffel Tower",
                provider: "OpenStreetMap",
            }),
        ]);
    });

    it("returns Nominatim lookup details without API keys", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{
            lat: "48.8584",
            lon: "2.2945",
            display_name: "Eiffel Tower, Paris, France",
            boundingbox: ["48.857", "48.859", "2.293", "2.296"],
            category: "tourism",
            type: "attraction",
        }])));

        const response = await detailsGET(new Request("http://localhost/api/places/details?place_id=osm:node:123"));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining("osm_ids=N123"), expect.any(Object));
        expect(json).toMatchObject({
            lat: 48.8584,
            lon: 2.2945,
            formattedAddress: "Eiffel Tower, Paris, France",
            provider: "OpenStreetMap",
            viewport: {
                northeast: { lat: 48.859, lng: 2.296 },
                southwest: { lat: 48.857, lng: 2.293 },
            },
        });
    });
});
