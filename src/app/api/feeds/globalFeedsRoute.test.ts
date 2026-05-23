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
            sources?: Array<{ sourceName: string; scope: string; ok: boolean; count: number }>;
        };

        expect(response.status).toBe(200);
        expect(json.items).toHaveLength(2);
        expect(json.items.map((item) => item.pluginId)).toEqual(["flood-alerts", "flood-alerts"]);
        expect(json.items.map((item) => item.properties.sourceScope)).toEqual(["global", "france"]);
        expect(json.sources).toEqual([
            expect.objectContaining({ sourceName: "GDACS", scope: "global", ok: true, count: 1 }),
            expect.objectContaining({ sourceName: "Vigicrues", scope: "france", ok: true, count: 1 }),
        ]);
    });

    it("returns an empty items array when upstreams fail", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 503)));

        const response = await feedResponse("tropical-cyclones");
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items).toEqual([]);
        expect(json.sources).toEqual([
            expect.objectContaining({ scope: "global", ok: false }),
            expect.objectContaining({ scope: "france", ok: false }),
        ]);
    });

    it("returns items when one adapter fails", async () => {
        vi.stubGlobal("fetch", vi.fn(async (url: string) => {
            if (url.includes("drought.json")) {
                return jsonResponse({
                    items: [{
                        id: "d-1",
                        latitude: 45,
                        longitude: 2,
                        name: "Drought sample",
                        date: "2026-05-22T10:00:00Z",
                    }],
                });
            }
            return jsonResponse({}, false, 503);
        }));

        const response = await feedResponse("drought-vegetation");
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items).toHaveLength(1);
        expect(json.sources).toEqual([
            expect.objectContaining({ sourceName: "NASA/MODIS", scope: "global", ok: true, count: 1 }),
            expect.objectContaining({ sourceName: "Propluvia", scope: "france", ok: false }),
        ]);
    });

    it("returns audit metadata even when feeds are empty", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ items: [] })));

        const response = await feedResponse("disease-outbreaks");
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items).toEqual([]);
        expect(json.sources).toEqual([
            expect.objectContaining({ sourceName: "WHO", scope: "global", ok: true, count: 0 }),
            expect.objectContaining({ sourceName: "Sante publique France", scope: "france", ok: true, count: 0 }),
        ]);
    });

    it("returns normalized new feed items through the shared route", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
            events: [{
                id: "wf-1",
                title: "Wildfire sample",
                geometry: [{ date: "2026-05-23T10:00:00Z", coordinates: [-118.2, 34.1] }],
            }],
        })));

        const response = await feedResponse("wildfire-hotspots");
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items).toEqual([
            expect.objectContaining({
                pluginId: "wildfire-hotspots",
                properties: expect.objectContaining({ sourceName: "NASA EONET" }),
            }),
        ]);
        expect(json.sources).toEqual([
            expect.objectContaining({ scope: "global", ok: true, count: 1 }),
            expect.objectContaining({ scope: "france", ok: true, count: 0 }),
        ]);
    });
});
