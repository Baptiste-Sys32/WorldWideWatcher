import {
 describe, it, expect, beforeEach, afterEach, vi
} from "vitest";

import { dataBus } from "@/core/data/DataBus";
import { cacheLayer } from "@/core/data/CacheLayer";
import type { GeoEntity, WorldPlugin } from "@/core/plugins/PluginTypes";
import { loadPluginFromManifest } from "./loadPluginFromManifest";
import { pluginManager } from "./PluginManager";

/**
 * PluginManager is the orchestrator everything else routes through —
 * register, enable, disable, fetch coordination, cache + bus updates.
 * Bugs here have wide blast radius: pins disappear, layers never load,
 * the agent bus stops driving the UI.
 *
 * Testing philosophy: we let the real `dataBus`, `cacheLayer`, and
 * `pollingManager` through (each is covered by its own unit tests) so
 * these tests verify the *observable* interaction between PluginManager
 * and the data layer — events fired, cache entries written, plugins
 * shown as enabled in the public API. Tests pin contracts that
 * downstream refactors should preserve, not implementation details
 * that should be allowed to change.
 *
 * Mocked: the Zustand store, analytics, engine-URL resolution, the
 * local-engine manifest fetcher, and the manifest loader. None are
 * load-bearing for these assertions; they otherwise drag in Cesium or
 * heavy framework setup.
 */

const mockStoreState = vi.hoisted(() => ({
    state: {
        setLayerLoading: () => {},
        dataConfig: { pluginSettings: {}, pollingIntervals: {} },
        sourceHealthByPlugin: {} as Record<string, { status: string; lastErrorMessage?: string | null }>,
        isPlaybackMode: false,
        currentTime: new Date(),
        showErrorToast: undefined,
    },
}));

vi.mock("@/core/state/store", () => ({
    useStore: {
        getState: () => mockStoreState.state,
        subscribe: () => () => {},
    },
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: () => {} }));
vi.mock("@/core/data/resolveEngineUrl", () => ({
    resolveEngineUrl: () => "wss://test.example/stream",
}));
vi.mock("@/core/data/engineManifest", () => ({
    fetchLocalEngineManifest: async () => null,
}));
vi.mock("./loadPluginFromManifest", () => ({
    loadPluginFromManifest: vi.fn(),
}));

function makePlugin(overrides: Partial<WorldPlugin> = {}): WorldPlugin {
    return {
        id: "test-plugin",
        name: "Test Plugin",
        description: "for tests",
        icon: "Box",
        category: "custom",
        version: "1.0.0",
        initialize: async () => {},
        destroy: () => {},
        fetch: async () => [],
        getPollingInterval: () => 0,
        getLayerConfig: () => ({
            color: "#fff",
            clusterEnabled: false,
            clusterDistance: 50,
        }),
        renderEntity: () => ({ type: "point" }),
        ...overrides,
    };
}

function makeEntity(id: string, pluginId: string): GeoEntity {
    return {
        id,
        pluginId,
        latitude: 0,
        longitude: 0,
        timestamp: new Date(),
        properties: {},
    };
}

beforeEach(() => {
    cacheLayer.clear();
    mockStoreState.state.sourceHealthByPlugin = {};
});

afterEach(() => {
    // PluginManager doesn't expose a registry-clear; destroy() runs the
    // teardown the AppShell uses at unmount.
    pluginManager.destroy();
    dataBus.removeAllListeners();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("PluginManager.registerPlugin", () => {
    it("stores the plugin and emits pluginRegistered with the default interval", async () => {
        const handler = vi.fn();
        dataBus.on("pluginRegistered", handler);
        const plugin = makePlugin({ id: "reg-1", getPollingInterval: () => 30_000 });

        await pluginManager.registerPlugin(plugin);

        expect(pluginManager.getPlugin("reg-1")).toBeDefined();
        expect(handler).toHaveBeenCalledWith({
            pluginId: "reg-1",
            defaultInterval: 30_000,
        });
    });

    it("ignores a second registerPlugin with the same id and warns", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        await pluginManager.registerPlugin(makePlugin({ id: "dup", name: "first" }));
        await pluginManager.registerPlugin(makePlugin({ id: "dup", name: "second" }));

        expect(pluginManager.getPlugin("dup")?.plugin.name).toBe("first");
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

describe("PluginManager.enablePlugin", () => {
    it("flips enabled=true and emits layerToggled(true)", async () => {
        const layerHandler = vi.fn();
        dataBus.on("layerToggled", layerHandler);
        await pluginManager.registerPlugin(makePlugin({ id: "en-1" }));

        await pluginManager.enablePlugin("en-1");

        expect(pluginManager.getPlugin("en-1")?.enabled).toBe(true);
        expect(layerHandler).toHaveBeenCalledWith({ pluginId: "en-1", enabled: true });
    });

    it("emits a fresh dataUpdated from cache before kicking off polling", async () => {
        const dataHandler = vi.fn();
        const cachedEntities = [makeEntity("e1", "en-2")];
        cacheLayer.set("en-2", cachedEntities, 60_000);
        await pluginManager.registerPlugin(makePlugin({ id: "en-2" }));
        dataBus.on("dataUpdated", dataHandler);

        await pluginManager.enablePlugin("en-2");

        expect(dataHandler).toHaveBeenCalledWith({
            pluginId: "en-2",
            entities: cachedEntities,
        });
    });

    it("uses the live cyber-attacks snapshot endpoint for the OTX initial fetch", async () => {
        const fetchMock = vi.fn(async (url: string) => ({
            ok: true,
            json: async () => ({
                items: [{
                    id: "otx-1",
                    ip: "203.0.113.10",
                    lat: 35.6961,
                    lon: 51.4231,
                    threatType: "APT",
                    pulseModified: "2026-05-22T12:00:00.000Z",
                    malwareFamilies: ["sample-family"],
                    tags: ["c2"],
                    targetedCountries: ["IR"],
                }],
            }),
        }));
        vi.stubGlobal("fetch", fetchMock);
        const dataHandler = vi.fn();
        dataBus.on("dataUpdated", dataHandler);
        await pluginManager.registerPlugin(makePlugin({ id: "cyber-attacks" }));

        await pluginManager.enablePlugin("cyber-attacks");

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith("https://test.example/api/cyber-attacks");
        });
        expect(fetchMock.mock.calls[0][0]).not.toContain("/history");
        await vi.waitFor(() => {
            expect(dataHandler).toHaveBeenCalledWith({
                pluginId: "cyber-attacks",
                entities: [expect.objectContaining({
                    id: "otx-1",
                    pluginId: "cyber-attacks",
                    latitude: 35.6961,
                    longitude: 51.4231,
                    label: "APT: 203.0.113.10",
                })],
            });
        });
    });

    it("runs one initial fetch for static or manual plugins with polling disabled", async () => {
        const fetchSpy = vi.fn(async () => [makeEntity("static-1", "static-layer")]);
        const dataHandler = vi.fn();
        dataBus.on("dataUpdated", dataHandler);
        await pluginManager.registerPlugin(makePlugin({
            id: "static-layer",
            fetch: fetchSpy,
            getPollingInterval: () => 0,
            getServerConfig: () => ({
                apiBasePath: "/api/static-layer",
                transportMode: "static",
                pollingIntervalMs: 0,
                sourceName: "Static Layer",
            }),
        }));

        await pluginManager.enablePlugin("static-layer");

        await vi.waitFor(() => {
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });
        expect(dataHandler).toHaveBeenCalledWith({
            pluginId: "static-layer",
            entities: [expect.objectContaining({ id: "static-1", pluginId: "static-layer" })],
        });
    });

    it("does not run an initial fetch for declared websocket push-only plugins", async () => {
        const fetchSpy = vi.fn(async () => []);
        const cachedEntities = [makeEntity("cached-ws", "ws-only")];
        cacheLayer.set("ws-only", cachedEntities, 60_000);
        const dataHandler = vi.fn();
        dataBus.on("dataUpdated", dataHandler);
        await pluginManager.registerPlugin(makePlugin({
            id: "ws-only",
            fetch: fetchSpy,
            getPollingInterval: () => 0,
            getServerConfig: () => ({
                apiBasePath: "/api/ws-only",
                transportMode: "websocket",
                pollingIntervalMs: 0,
                sourceName: "WS Only",
            }),
        }));

        await pluginManager.enablePlugin("ws-only");

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(pluginManager.getEntities("ws-only")).toEqual(cachedEntities);
        expect(dataHandler).toHaveBeenCalledWith({
            pluginId: "ws-only",
            entities: cachedEntities,
        });
    });
});

describe("PluginManager.disablePlugin", () => {
    it("clears entities and emits layerToggled(false) + dataUpdated([])", async () => {
        const layerHandler = vi.fn();
        const dataHandler = vi.fn();
        await pluginManager.registerPlugin(makePlugin({ id: "dis-1" }));
        await pluginManager.enablePlugin("dis-1");

        dataBus.on("layerToggled", layerHandler);
        dataBus.on("dataUpdated", dataHandler);
        pluginManager.disablePlugin("dis-1");

        expect(pluginManager.getPlugin("dis-1")?.enabled).toBe(false);
        expect(pluginManager.getEntities("dis-1")).toEqual([]);
        expect(layerHandler).toHaveBeenCalledWith({ pluginId: "dis-1", enabled: false });
        expect(dataHandler).toHaveBeenCalledWith({ pluginId: "dis-1", entities: [] });
    });
});

describe("PluginManager satellite partial refresh handling", () => {
    it("preserves loaded Starlink entities when a degraded refresh omits Starlink", async () => {
        const dataHandler = vi.fn();
        dataBus.on("dataUpdated", dataHandler);
        const plugin = makePlugin({
            id: "satellites",
            fetch: async () => [makeEntity("iss-next", "satellites")],
            getPollingInterval: () => 300_000,
        });
        await pluginManager.registerPlugin(plugin);
        await pluginManager.enablePlugin("satellites");

        const managed = pluginManager.getPlugin("satellites");
        managed?.context.onDataUpdate([
            { ...makeEntity("iss", "satellites"), properties: { orbitGroup: "stations" } },
            { ...makeEntity("starlink-1", "satellites"), properties: { orbitGroup: "starlink" } },
        ]);
        mockStoreState.state.sourceHealthByPlugin = {
            satellites: { status: "degraded", lastErrorMessage: "CelesTrak starlink failed" },
        };

        await pluginManager.fetchForPlugin("satellites", { start: new Date(0), end: new Date(1) });

        expect(pluginManager.getEntities("satellites").map((entity) => entity.id)).toEqual(["iss-next", "starlink-1"]);
        expect(dataHandler).toHaveBeenLastCalledWith({
            pluginId: "satellites",
            entities: [
                expect.objectContaining({ id: "iss-next" }),
                expect.objectContaining({ id: "starlink-1" }),
            ],
        });
    });

    it("clears Starlink entities when the satellite layer is disabled", async () => {
        const dataHandler = vi.fn();
        await pluginManager.registerPlugin(makePlugin({ id: "satellites" }));
        await pluginManager.enablePlugin("satellites");
        pluginManager.getPlugin("satellites")?.context.onDataUpdate([
            { ...makeEntity("starlink-1", "satellites"), properties: { orbitGroup: "starlink" } },
        ]);
        dataBus.on("dataUpdated", dataHandler);

        pluginManager.disablePlugin("satellites");

        expect(pluginManager.getEntities("satellites")).toEqual([]);
        expect(dataHandler).toHaveBeenCalledWith({ pluginId: "satellites", entities: [] });
    });
});

describe("PluginManager — data flow contract", () => {
    it("a plugin's onDataUpdate writes through to the cache and emits dataUpdated", async () => {
        const dataHandler = vi.fn();
        dataBus.on("dataUpdated", dataHandler);
        await pluginManager.registerPlugin(makePlugin({ id: "df-1" }));

        const managed = pluginManager.getPlugin("df-1");
        const entities = [makeEntity("a", "df-1"), makeEntity("b", "df-1")];
        managed!.context.onDataUpdate(entities);

        // Cache populated for the plugin id
        expect(cacheLayer.get("df-1")).toEqual(entities);
        // Bus emits with the same entities
        expect(dataHandler).toHaveBeenCalledWith({
            pluginId: "df-1",
            entities,
        });
        // Public accessor reflects the update
        expect(pluginManager.getEntities("df-1")).toEqual(entities);
    });

    it("normalizes returned entity plugin IDs to the host registry ID", async () => {
        const dataHandler = vi.fn();
        dataBus.on("dataUpdated", dataHandler);
        await pluginManager.registerPlugin(makePlugin({ id: "nuclear-facilities" }));

        const incoming = [makeEntity("plant-1", "nuclear")];
        pluginManager.getPlugin("nuclear-facilities")!.context.onDataUpdate(incoming);

        const expected = [{ ...incoming[0], pluginId: "nuclear-facilities" }];
        expect(cacheLayer.get("nuclear-facilities")).toEqual(expected);
        expect(pluginManager.getEntities("nuclear-facilities")).toEqual(expected);
        expect(dataHandler).toHaveBeenCalledWith({
            pluginId: "nuclear-facilities",
            entities: expected,
        });
    });
});

describe("PluginManager — getAllEntities filters by enabled flag", () => {
    it("excludes entities owned by a disabled plugin", async () => {
        await pluginManager.registerPlugin(makePlugin({ id: "ae-on" }));
        await pluginManager.registerPlugin(makePlugin({ id: "ae-off" }));
        await pluginManager.enablePlugin("ae-on");
        // ae-off intentionally not enabled

        // Both plugins receive data updates...
        pluginManager.getPlugin("ae-on")!.context.onDataUpdate([
            makeEntity("on-1", "ae-on"),
        ]);
        pluginManager.getPlugin("ae-off")!.context.onDataUpdate([
            makeEntity("off-1", "ae-off"),
        ]);

        // ...but getAllEntities only returns entities from enabled plugins.
        const all = pluginManager.getAllEntities();
        expect(all.map((e) => e.id)).toEqual(["on-1"]);
    });
});

describe("PluginManager.updateTimeRange", () => {
    it("calls plugin.fetch on every enabled plugin with the new range", async () => {
        const fetchSpy = vi.fn(async () => []);
        await pluginManager.registerPlugin(
            makePlugin({ id: "tr-on", fetch: fetchSpy }),
        );
        await pluginManager.registerPlugin(
            makePlugin({ id: "tr-off", fetch: vi.fn(async () => []) }),
        );
        await pluginManager.enablePlugin("tr-on");
        // tr-off stays disabled

        const timeRange = {
            start: new Date("2026-01-01"),
            end: new Date("2026-01-02"),
        };
        await pluginManager.updateTimeRange(timeRange);

        // Enabled plugin's fetch was called with the new range
        expect(fetchSpy).toHaveBeenCalledWith(timeRange);
        // Disabled plugin's fetch was NOT called
        const disabledPluginFetch = pluginManager.getPlugin("tr-off")!.plugin.fetch as ReturnType<typeof vi.fn>;
        expect(disabledPluginFetch).not.toHaveBeenCalled();
    });
});

describe("PluginManager.destroy", () => {
    it("calls plugin.destroy on each registered plugin and clears the registry", async () => {
        const destroySpy1 = vi.fn();
        const destroySpy2 = vi.fn();
        await pluginManager.registerPlugin(
            makePlugin({ id: "d-1", destroy: destroySpy1 }),
        );
        await pluginManager.registerPlugin(
            makePlugin({ id: "d-2", destroy: destroySpy2 }),
        );

        pluginManager.destroy();

        expect(destroySpy1).toHaveBeenCalled();
        expect(destroySpy2).toHaveBeenCalled();
        expect(pluginManager.getAllPlugins()).toEqual([]);
    });
});

describe("PluginManager.togglePlugin", () => {
    it("flips a plugin between enabled and disabled across successive calls", async () => {
        await pluginManager.registerPlugin(makePlugin({ id: "tg-1" }));
        expect(pluginManager.getPlugin("tg-1")?.enabled).toBe(false);

        // togglePlugin is sync but calls async enablePlugin; wait for
        // the state flip to land.
        pluginManager.togglePlugin("tg-1");
        await vi.waitFor(() => expect(pluginManager.getPlugin("tg-1")?.enabled).toBe(true),);

        // Second toggle should flip it off — disablePlugin is sync, so
        // no waitFor needed.
        pluginManager.togglePlugin("tg-1");
        expect(pluginManager.getPlugin("tg-1")?.enabled).toBe(false);
    });
});

describe("PluginManager.loadFromManifest", () => {
    it("delegates to loadPluginFromManifest and registers the result", async () => {
        const fakePlugin = makePlugin({ id: "lm-1", name: "From Manifest" });
        (loadPluginFromManifest as ReturnType<typeof vi.fn>).mockResolvedValue(
            fakePlugin,
        );

        await pluginManager.loadFromManifest({
            id: "lm-1",
            name: "From Manifest",
            version: "1.0.0",
            type: "data-layer",
            format: "bundle",
            trust: "built-in",
            capabilities: ["data:own"],
            category: "custom",
            icon: "Box",
            entry: "/dev/null",
        } as never);

        expect(loadPluginFromManifest).toHaveBeenCalled();
        expect(pluginManager.getPlugin("lm-1")).toBeDefined();
        expect(pluginManager.getPlugin("lm-1")?.plugin.name).toBe("From Manifest");
    });
});
