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
});
