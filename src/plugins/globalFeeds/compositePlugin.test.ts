import { describe, expect, it, vi } from "vitest";
import { createGlobalFeedPlugin } from "./compositePlugin";

describe("createGlobalFeedPlugin", () => {
    it("fetches normalized API items and keeps the parent plugin id", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({
                items: [{
                    id: "source-1",
                    pluginId: "wrong",
                    latitude: 12,
                    longitude: 34,
                    timestamp: "2026-05-22T10:00:00.000Z",
                    properties: {
                        sourceScope: "global",
                        sourceName: "GDACS",
                    },
                }],
            }),
        })));
        const plugin = createGlobalFeedPlugin("flood-alerts");

        const items = await plugin.fetch({ start: new Date(), end: new Date() });

        expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/feeds/flood-alerts"));
        expect(items).toEqual([expect.objectContaining({
            id: "source-1",
            pluginId: "flood-alerts",
            timestamp: new Date("2026-05-22T10:00:00.000Z"),
        })]);
        vi.unstubAllGlobals();
    });

    it("uses the natural disaster category expected by the layer panel", () => {
        expect(createGlobalFeedPlugin("disease-outbreaks").category).toBe("natural-disaster");
    });

    it("assigns domain categories for the new feed wave", () => {
        expect(createGlobalFeedPlugin("air-quality").category).toBe("weather");
        expect(createGlobalFeedPlugin("marine-buoys").category).toBe("maritime");
        expect(createGlobalFeedPlugin("satellites").category).toBe("space");
        expect(createGlobalFeedPlugin("gps-jamming").category).toBe("space");
        expect(createGlobalFeedPlugin("us-weather-alerts").category).toBe("weather");
    });

    it("exposes category legends and filters for space feeds", () => {
        const satellites = createGlobalFeedPlugin("satellites");
        const gpsJamming = createGlobalFeedPlugin("gps-jamming");

        expect(satellites.getLegend?.().map((item) => item.label)).toContain("Space Stations");
        expect(satellites.getFilterDefinitions?.()).toEqual([
            expect.objectContaining({ id: "orbit-group", propertyKey: "orbitGroup" }),
        ]);
        expect(gpsJamming.getLegend?.().map((item) => item.label)).toContain("High");
        expect(gpsJamming.getFilterDefinitions?.()).toEqual([
            expect.objectContaining({ id: "interference-level", propertyKey: "interferenceLevel" }),
            expect.objectContaining({ id: "region", propertyKey: "region" }),
        ]);
    });
});
