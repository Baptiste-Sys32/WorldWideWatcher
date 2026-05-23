// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { feedResponse } from "./globalFeedsRoute";

function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
        ok,
        status,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

describe("global feed API route", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns merged normalized JSON when upstream adapters succeed", async () => {
        vi.stubGlobal("fetch", vi.fn(async (url: string) => {
            if (url.includes("eventtypes=FL")) {
                return jsonResponse({
                    features: [{
                        id: "fl-1",
                        geometry: { type: "Point", coordinates: [12.5, 41.9] },
                        properties: { country: "Italy", eventname: "Flood Italy" },
                    }],
                });
            }
            return jsonResponse({
                items: [{
                    code_station: "A1",
                    latitude: 45,
                    longitude: 2,
                    libelle_station: "Station A1",
                }],
            });
        }));

        const response = await feedResponse("flood-alerts");
        const json = await response.json() as {
            items: Array<{
                pluginId: string;
                properties: { sourceScope: string };
            }>;
        };

        expect(response.status).toBe(200);
        expect(json.items).toHaveLength(2);
        expect(json.items.map((item) => item.pluginId)).toEqual(["flood-alerts", "flood-alerts"]);
        expect(json.items.map((item) => item.properties.sourceScope)).toEqual(["global", "france"]);
    });

    it("returns an empty items array when upstreams fail", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 503)));

        const response = await feedResponse("tropical-cyclones");
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json).toEqual({ items: [] });
    });
});
