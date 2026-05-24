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

    it("honors france-first source priority for composite feeds", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({
                items: [
                    {
                        id: "global-1",
                        pluginId: "flood-alerts",
                        latitude: 12,
                        longitude: 34,
                        timestamp: "2026-05-22T10:00:00.000Z",
                        properties: { sourceScope: "global", sourceName: "GDACS" },
                    },
                    {
                        id: "france-1",
                        pluginId: "flood-alerts",
                        latitude: 45,
                        longitude: 2,
                        timestamp: "2026-05-22T10:00:00.000Z",
                        properties: { sourceScope: "france", sourceName: "Vigicrues" },
                    },
                ],
                sources: [
                    { sourceName: "GDACS", scope: "global", ok: true, count: 1 },
                    { sourceName: "Vigicrues", scope: "france", ok: true, count: 1 },
                ],
            }),
        })));
        const plugin = createGlobalFeedPlugin("flood-alerts");
        await plugin.initialize({
            apiBaseUrl: "",
            getEngineUrl: () => "",
            env: {},
            edition: "local",
            timeRange: { start: new Date(), end: new Date() },
            onDataUpdate: vi.fn(),
            onError: vi.fn(),
            getPluginSettings: <T = unknown>() => ({ sourcePriority: "france-first" }) as T,
            isPlaybackMode: () => false,
            getCurrentTime: () => new Date(),
        });

        const items = await plugin.fetch({ start: new Date(), end: new Date() });

        expect(items.map((item) => item.id)).toEqual(["france-1", "global-1"]);
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
        expect(createGlobalFeedPlugin("power-outages").category).toBe("infrastructure");
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

    it("exposes legends and filters for ash and outage feeds", () => {
        const ash = createGlobalFeedPlugin("volcanic-ash-advisories");
        const power = createGlobalFeedPlugin("power-outages");

        expect(ash.getLegend?.().map((item) => item.label)).toContain("Orange / Watch");
        expect(ash.getFilterDefinitions?.()).toEqual([
            expect.objectContaining({ id: "ash-level", propertyKey: "colorCode" }),
        ]);
        expect(power.getLegend?.().map((item) => item.label)).toContain("Major");
        expect(power.getFilterDefinitions?.()).toEqual([
            expect.objectContaining({ id: "outage-level", propertyKey: "outageLevel" }),
        ]);
    });
});
