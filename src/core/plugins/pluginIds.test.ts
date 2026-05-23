import { describe, expect, it } from "vitest";
import { getPluginAliases, toEnginePluginId, toRegistryPluginId } from "./pluginIds";

describe("pluginIds", () => {
    it("maps registry IDs to engine IDs", () => {
        expect(toEnginePluginId("civil-unrest")).toBe("civilUnrest");
        expect(toEnginePluginId("conflict-events")).toBe("conflictEvents");
        expect(toEnginePluginId("unknown-plugin")).toBe("unknown-plugin");
    });

    it("maps engine IDs back to registry IDs", () => {
        expect(toRegistryPluginId("civilUnrest")).toBe("civil-unrest");
        expect(toRegistryPluginId("conflictEvents")).toBe("conflict-events");
        expect(toRegistryPluginId("customPlugin")).toBe("custom-plugin");
    });

    it("exposes aliases for diagnostics", () => {
        expect(getPluginAliases()["international-sanctions"]).toBe("sanctions");
    });
});
