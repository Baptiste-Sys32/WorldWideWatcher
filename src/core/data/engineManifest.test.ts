import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocalEngineManifest, localEngineHasPlugin, resetManifestCache } from "./engineManifest";

describe("engine manifest", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetManifestCache();
    });

    it("uses engine-reported plugin IDs directly without client-side aliases", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ plugins: ["gpsjam", "civilUnrest"] }),
        }));

        await expect(fetchLocalEngineManifest()).resolves.toEqual(["gpsjam", "civilUnrest"]);
        expect(localEngineHasPlugin("gpsjam")).toBe(true);
        expect(localEngineHasPlugin("gps-jamming")).toBe(false);
        expect(localEngineHasPlugin("civil-unrest")).toBe(false);
    });
});
