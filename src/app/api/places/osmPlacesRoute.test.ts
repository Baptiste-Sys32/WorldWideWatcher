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
