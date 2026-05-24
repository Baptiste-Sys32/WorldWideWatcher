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

    it("returns satellite items from successful CelesTrak groups when another group is rate limited", async () => {
        vi.stubGlobal("fetch", vi.fn(async (url: string) => {
            if (url.includes("GROUP=starlink") && url.includes("FORMAT=tle")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers({ "content-type": "text/plain" }),
                    text: async () => [
                        "STARLINK-1",
                        "1 44235U 19029A   26143.50000000  .00002000  00000+0  10000-3 0  9991",
                        "2 44235  53.0000  67.1668 0001000  86.3178 273.8672 15.05500000 12345",
                    ].join("\n"),
                    json: async () => ({}),
                };
            }
            if (url.includes("GROUP=starlink")) return jsonResponse("not updated", false, 403);
            return jsonResponse([{
                OBJECT_NAME: "ISS (ZARYA)",
                OBJECT_ID: "1998-067A",
                EPOCH: "2026-05-22T12:28:18.496128",
                MEAN_MOTION: 15.49313075,
                ECCENTRICITY: 0.0007537,
                INCLINATION: 51.633,
                RA_OF_ASC_NODE: 67.1668,
                ARG_OF_PERICENTER: 86.3178,
                MEAN_ANOMALY: 273.8672,
                EPHEMERIS_TYPE: 0,
                CLASSIFICATION_TYPE: "U",
                NORAD_CAT_ID: 25544,
                ELEMENT_SET_NO: 999,
                REV_AT_EPOCH: 56777,
                BSTAR: 0.00013945,
                MEAN_MOTION_DOT: 0.00007327,
                MEAN_MOTION_DDOT: 0,
            }]);
        }));

        const response = await feedResponse("satellites");
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items.length).toBeGreaterThan(0);
        expect(json.items[0]).toEqual(expect.objectContaining({
            pluginId: "satellites",
            properties: expect.objectContaining({ sourceName: "CelesTrak" }),
        }));
        expect(json.items).toEqual(expect.arrayContaining([
            expect.objectContaining({
                properties: expect.objectContaining({ orbitGroup: "starlink" }),
            }),
        ]));
        expect(json.sources).toEqual(expect.arrayContaining([
            expect.objectContaining({ sourceName: "CelesTrak stations", scope: "stations", ok: true }),
            expect.objectContaining({ sourceName: "CelesTrak weather", scope: "weather", ok: true }),
            expect.objectContaining({ sourceName: "CelesTrak starlink", scope: "starlink", ok: true }),
        ]));
    });

    it("returns GPS jamming feed items", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
            source: "gpsjam_mock",
            items: [{
                id: "jam-1",
                lat: 47.42,
                lon: 36.26,
                interferenceLevel: "high",
                timestamp: "2026-05-23T00:00:00.000Z",
                region: "Eastern Europe / Ukraine",
            }],
        })));

        const response = await feedResponse("gps-jamming");
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items).toHaveLength(1);
        expect(json.items[0]).toEqual(expect.objectContaining({
            pluginId: "gps-jamming",
            properties: expect.objectContaining({ interferenceLevel: "high" }),
        }));
    });

    it("returns volcanic ash advisory items with source diagnostics", async () => {
        vi.stubGlobal("fetch", vi.fn(async (url: string) => {
            if (url.includes("getElevatedVolcanoes")) {
                return jsonResponse([{
                    volcano_name: "Kilauea",
                    vnum: "332010",
                    sent_utc: "2026-05-19 19:56:32",
                    color_code: "YELLOW",
                    alert_level: "ADVISORY",
                }]);
            }
            return jsonResponse([{
                vnum: "332010",
                volcano_name: "Kilauea",
                latitude: 19.421,
                longitude: -155.287,
            }]);
        }));

        const response = await feedResponse("volcanic-ash-advisories");
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items).toEqual([
            expect.objectContaining({
                pluginId: "volcanic-ash-advisories",
                properties: expect.objectContaining({ sourceName: "USGS HANS", colorCode: "yellow" }),
            }),
        ]);
        expect(json.sources).toEqual([
            expect.objectContaining({ sourceName: "USGS HANS", scope: "us", ok: true, count: 1 }),
            expect.objectContaining({ sourceName: "France scoped fallback", scope: "france", ok: true, count: 0 }),
        ]);
    });

    it("reports power outage feed limitation when no reliable public URL is configured", async () => {
        vi.stubGlobal("fetch", vi.fn());

        const response = await feedResponse("power-outages");
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items).toEqual([]);
        expect(json.sources).toEqual([
            expect.objectContaining({
                sourceName: "Power outage public source",
                scope: "us",
                ok: false,
                errorMessage: expect.stringContaining("POWER_OUTAGE_FEED_URL"),
            }),
            expect.objectContaining({ sourceName: "France scoped fallback", scope: "france", ok: true, count: 0 }),
        ]);
    });
});
