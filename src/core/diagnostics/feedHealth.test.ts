import { describe, expect, it } from "vitest";
import {
    buildFeedDiagnostics,
    getFeedRuntimeState,
    labelForFeedState,
} from "./feedHealth";
import type { WorldPlugin } from "@/core/plugins/PluginTypes";

const plugin = {
    id: "sample",
    name: "Sample",
    description: "Sample feed",
    icon: "Box",
    category: "custom",
    version: "1.0.0",
    initialize: async () => {},
    destroy: () => {},
    fetch: async () => [],
    getPollingInterval: () => 60_000,
    getLayerConfig: () => ({ color: "#fff", clusterEnabled: false, clusterDistance: 0 }),
    renderEntity: () => ({ type: "point" as const, color: "#fff" }),
} satisfies WorldPlugin;

describe("feed health diagnostics", () => {
    it("keeps idle enabled feeds distinct from disabled feeds", () => {
        expect(getFeedRuntimeState(true, { enabled: true, loading: false, entityCount: 0 }, { status: "healthy" }, 0)).toBe("idle");
        expect(getFeedRuntimeState(false, { enabled: false, loading: false, entityCount: 10 }, { status: "healthy" }, 10)).toBe("disabled");
        expect(labelForFeedState("idle")).toBe("Idle");
        expect(labelForFeedState("disabled")).toBe("Disabled");
    });

    it("builds copyable feed diagnostics with source attempts and errors", () => {
        const diagnostics = buildFeedDiagnostics({
            plugin,
            enabled: true,
            layer: { enabled: true, loading: false, entityCount: 2 },
            entityCount: 2,
            health: {
                status: "degraded",
                lastAttemptAt: 1,
                lastSuccessAt: 2,
                lastErrorMessage: "upstream failed",
                sourceName: "Composite",
                sourceType: "composite",
                sources: [
                    { sourceName: "A", scope: "global", ok: true, count: 2 },
                    { sourceName: "B", scope: "france", ok: false, count: 0, errorMessage: "HTTP 503" },
                ],
            },
        });

        expect(diagnostics).toMatchObject({
            id: "sample",
            enabled: true,
            runtimeState: "degraded",
            entityCount: 2,
            sourceName: "Composite",
            latestError: "upstream failed",
        });
        expect(diagnostics.sources).toHaveLength(2);
    });
});
