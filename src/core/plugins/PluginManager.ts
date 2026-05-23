/* eslint-disable no-console */
import type {
    WorldPlugin,
    GeoEntity,
    TimeRange,
    PluginContext,
} from "@/core/plugins/PluginTypes";
import type { PluginManifest } from "@/core/plugins/PluginManifest";
import { loadPluginFromManifest } from "@/core/plugins/loadPluginFromManifest";
import { dataBus } from "@/core/data/DataBus";
import { pollingManager } from "@/core/data/PollingManager";
import { cacheLayer } from "@/core/data/CacheLayer";
import { useStore } from "@/core/state/store";
import { trackEvent } from "@/lib/analytics";
import { resolveEngineUrl } from "@/core/data/resolveEngineUrl";
import { fetchLocalEngineManifest } from "@/core/data/engineManifest";
import { pluginRegistry } from "@/core/plugins/PluginRegistry";
import { normalizeAviationEntities } from "@/core/data/normalizeAviationEntities";
import type { SourceHealth, SourceType } from "@/core/state/sourceHealthSlice";
import { applyFetchFallbacks } from "./sourceAdapters";

function inferSourceType(plugin: WorldPlugin): SourceType {
    const config = plugin.getServerConfig?.();
    if (config?.transportMode === "websocket" || config?.streamUrl) return "ws";
    if (config?.transportMode === "static") return "static";
    if (config?.transportMode === "manual") return "static";
    if (plugin.id.startsWith("tropical-")
        || plugin.id.startsWith("flood-")
        || plugin.id.startsWith("drought-")
        || plugin.id.startsWith("disease-")) {
        return "composite";
    }
    return "rest";
}

function getSourceName(plugin: WorldPlugin): string {
    return plugin.getServerConfig?.()?.sourceName ?? plugin.name;
}

function getSourceUrl(plugin: WorldPlugin, context: PluginContext): string | undefined {
    const config = plugin.getServerConfig?.();
    return config?.sourceUrl ?? config?.apiBasePath ?? context.getEngineUrl();
}

function emitSourceHealth(plugin: WorldPlugin, context: PluginContext, patch: Partial<SourceHealth>): void {
    dataBus.emit("sourceHealthChanged", {
        pluginId: plugin.id,
        patch: {
            sourceName: getSourceName(plugin),
            sourceUrl: getSourceUrl(plugin, context),
            sourceType: inferSourceType(plugin),
            ...patch,
        },
    });
}

function isDeclaredWebsocketPushOnly(plugin: WorldPlugin): boolean {
    const config = plugin.getServerConfig?.();
    return config?.transportMode === "websocket" && (config.pollingIntervalMs ?? plugin.getPollingInterval()) <= 0;
}

function shouldRunInitialFetch(plugin: WorldPlugin): boolean {
    if (isDeclaredWebsocketPushOnly(plugin)) return false;
    return plugin.getPollingInterval() <= 0;
}

function isStarlinkEntity(entity: GeoEntity): boolean {
    return String(entity.properties?.orbitGroup ?? "").toLowerCase() === "starlink";
}

type EntitiesWithSourceHealth = GeoEntity[] & {
    __wwvSourceHealthPatch?: Partial<SourceHealth>;
};

/**
 * ManagedPlugin represents the internal state and instance of a registered data source.
 * It wraps the raw WorldPlugin with system-level tracking for its enabled status,
 * current data snapshot (entities), and the execution context provided by the manager.
 */
interface ManagedPlugin {
    plugin: WorldPlugin;
    enabled: boolean;
    entities: GeoEntity[];
    context: PluginContext;
}

/**
 * PluginManager is the central orchestrator for the entire data ingestion pipeline.
 * It is responsible for the full lifecycle of data sources—from initial registration
 * and environment injection to polling orchestration, data caching, and routing
 * snapshots to the global state and event bus.
 */
class PluginManager {
    private plugins: Map<string, ManagedPlugin> = new Map();
    private loadedManifests: Map<string, PluginManifest> = new Map();
    private initialized = false;
    private configCacheMaxAge = 3600000;

    /**
     * Initializes the PluginManager and prepares the persistent cache layer.
     * This must be called before any plugins are enabled to ensure that
     * initial data hydration from IndexedDB/Localstorage is possible.
     *
     * @returns A promise that resolves once the cache layer is ready.
     */
    async init(): Promise<void> {
        if (this.initialized) return;
        await cacheLayer.init();

        dataBus.on("dynamicPluginCreate", async ({ plugin, autoEnable }) => {
            try {
                await this.registerPlugin(plugin);
                pluginRegistry.register(plugin);
                if (autoEnable) {
                    this.enablePlugin(plugin.id);
                }
            } catch (err) {
                console.error(`[PluginManager] Failed to create dynamic plugin ${plugin.id}:`, err);
                const toastStr = `Failed to load ${plugin.name}`;
                dataBus.emit("pluginError", { pluginId: plugin.id, message: toastStr });
            }
        });

        dataBus.on("dynamicPluginRemove", ({ pluginId }) => {
            this.unregisterPlugin(pluginId);
            pluginRegistry.unregister(pluginId);
        });

        this.initialized = true;
    }

    /**
     * Registers a new plugin and establishes its execution environment.
     * This method is responsible for injecting `NEXT_PUBLIC_WWV_PLUGIN_*` environment
     * variables, resolving the correct Data Engine URLs, and setting up the
     * pub/sub routing for the plugin's data updates and error telemetry.
     *
     * @param plugin - The WorldPlugin instance to onboard into the manager.
     * @returns A promise that resolves when initialization and polling registration are complete.
     */
    async registerPlugin(plugin: WorldPlugin): Promise<void> {
        if (this.plugins.has(plugin.id)) {
            console.warn(`[PluginManager] Plugin "${plugin.id}" already registered`);
            return;
        }

        const envVars: Record<string, string> = {};
        if (typeof process !== "undefined" && process.env) {
            for (const [key, value] of Object.entries(process.env)) {
                if (key.startsWith("NEXT_PUBLIC_WWV_PLUGIN_")) {
                    envVars[key.replace("NEXT_PUBLIC_WWV_PLUGIN_", "")] = value || "";
                }
            }
        }

        // Next.js inlines `process.env.NEXT_PUBLIC_*` only at known static
        // reference sites. The iteration above can come back empty in the
        // browser bundle even when NEXT_PUBLIC_WWV_PLUGIN_* is set at build,
        // because `Object.entries(process.env)` is not a static reference and
        // the bundler doesn't expose every NEXT_PUBLIC_ key on the runtime
        // object. Add explicit static references so the values reach plugin
        // contexts. Add new known keys here as they're introduced.
        // Format the raw engine URL to ensure it uses http/https for initial fetch calls
        const rawEngineUrl = process.env.NEXT_PUBLIC_WWV_PLUGIN_DATA_ENGINE_URL;
        const httpEngineUrl = rawEngineUrl 
            ? rawEngineUrl.replace(/\/stream$/, "").replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://") 
            : undefined;

        const explicitVars: Record<string, string | undefined> = {
            DATA_ENGINE_URL: httpEngineUrl,
        };
        for (const [k, v] of Object.entries(explicitVars)) {
            if (v && !envVars[k]) envVars[k] = v;
        }

        const edition = (process.env.NEXT_PUBLIC_WWV_EDITION || "local") as "local" | "cloud" | "demo";

        if (Object.keys(envVars).length > 0) {
            console.debug(`[PluginManager] Injected ${Object.keys(envVars).length} custom env vars into "${plugin.id}"`);
        }

        const wsUrl = resolveEngineUrl(plugin.id);
        const apiBaseUrl = wsUrl
            .replace(/\/stream$/, "")
            .replace(/^ws:\/\//, "http://")
            .replace(/^wss:\/\//, "https://");

        const getHttpEngineUrl = () => {
            if (plugin.id === "aviation" && typeof window !== "undefined") {
                return window.location.origin;
            }
            const ws = resolveEngineUrl(plugin.id);
            return ws.replace(/\/stream$/, "").replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
        };

        const context: PluginContext = {
            apiBaseUrl,
            getEngineUrl: getHttpEngineUrl,
            env: envVars,
            edition,
            timeRange: {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date(),
            },
            onDataUpdate: (entities) => {
                this.handleDataUpdate(plugin.id, entities);
            },
            onError: (error) => {
                // "Failed to fetch" is a non-fatal best-effort HTTP cold-start pull
                // that WS-native plugins attempt before the WebSocket delivers data.
                // Downgrade to warn to avoid alarming noise; the WS pipeline handles
                // actual data delivery independently.
                const isNonFatalFetch =
                    error instanceof TypeError && error.message === "Failed to fetch";
                if (isNonFatalFetch) {
                    console.warn("[Plugin:%s] Non-fatal initial fetch failed (WS will deliver data): %s", plugin.id, error.message);
                    emitSourceHealth(plugin, context, {
                        status: "degraded",
                        lastErrorAt: Date.now(),
                        lastErrorMessage: error.message,
                    });
                    return;
                }
                console.error("[Plugin:%s]", plugin.id, error);
                trackEvent("plugin-error", { plugin: plugin.id, error: error.message });
                emitSourceHealth(plugin, context, {
                    status: "error",
                    lastErrorAt: Date.now(),
                    lastErrorMessage: error.message,
                });
                dataBus.emit("pluginError", { pluginId: plugin.id, message: `[${plugin.name || plugin.id}] ${error.message}`, error });
            },
            getPluginSettings: <T = unknown>(pluginId: string) => useStore.getState().dataConfig.pluginSettings[pluginId] as T | undefined,
            isPlaybackMode: () => useStore.getState().isPlaybackMode,
            getCurrentTime: () => useStore.getState().currentTime,
        };

        this.plugins.set(plugin.id, {
            plugin,
            enabled: false,
            entities: [],
            context,
        });
        emitSourceHealth(plugin, context, {
            status: "idle",
            itemCount: 0,
            lastErrorMessage: null,
        });

        try {
            await plugin.initialize(context);
        } catch (err) {
            console.error(`[PluginManager] Failed to initialize "${plugin.id}":`, err);
        }

        applyFetchFallbacks(plugin, context);

        // Emit an event that a plugin was registered so the external store can assign default polling intervals
        dataBus.emit("pluginRegistered", {
            pluginId: plugin.id,
            defaultInterval: plugin.getPollingInterval()
        });

        // Register polling
        const pollingInterval = plugin.id === "aviation" && plugin.getPollingInterval() <= 0
            ? 15_000
            : plugin.getPollingInterval();

        pollingManager.register(
            plugin.id,
            pollingInterval,
            async () => {
                const managed = this.plugins.get(plugin.id);
                if (!managed || !managed.enabled) return;
                try {
                    const started = performance.now();
                    emitSourceHealth(plugin, managed.context, {
                        status: "loading",
                        lastAttemptAt: Date.now(),
                    });
                    const entities = await plugin.fetch(managed.context.timeRange);
                    emitSourceHealth(plugin, managed.context, {
                        latencyMs: Math.round(performance.now() - started),
                    });
                    this.handleDataUpdate(plugin.id, entities);
                } catch (err: unknown) {
                    dataBus.emit("layerLoadingChanged", { pluginId: plugin.id, loading: false });
                    managed.context.onError(err instanceof Error ? err : new Error(String(err)));
                    // Do not re-throw: onError already handled reporting.
                    // Re-throwing would produce an unhandled rejection in PollingManager
                    // with no additional benefit.
                }
            }
        );
    }

    /**
     * Activates a plugin and initiates its data retrieval cycle.
     * This method attempts an immediate cache hydration to ensure the UI feels
     * instantaneous, then signals the polling manager to begin background fetching.
     *
     * @param pluginId - The unique identifier of the plugin to enable.
     * @returns A promise that resolves when the plugin status is updated and cached data is emitted.
     */
    async enablePlugin(pluginId: string): Promise<void> {
        const start = performance.now();
        console.debug(`[PluginManager] enablePlugin called for ${pluginId}`);
        // Ensure local manifest is fetched so we don't accidentally fall back to cloud if toggled too fast
        await fetchLocalEngineManifest();
        console.debug(`[PluginManager] Manifest fetched for ${pluginId}. Took ${(performance.now() - start).toFixed(2)}ms`);

        const managed = this.plugins.get(pluginId);
        if (!managed) {
            console.error(`[PluginManager] Plugin ${pluginId} not found in managed plugins`);
            return;
        }
        managed.enabled = true;

        // Signal that data is loading
        dataBus.emit("layerLoadingChanged", { pluginId, loading: true });
        emitSourceHealth(managed.plugin, managed.context, {
            status: "loading",
            lastAttemptAt: Date.now(),
        });

        // Try to load from cache immediately so UI feels responsive
        let cached = cacheLayer.get(pluginId);
        if (!cached) {
            cached = await cacheLayer.getFromPersistent(pluginId);
        }

        // If still enabled and we got cached data, emit it
        if (cached && managed.enabled) {
            managed.entities = cached;
            dataBus.emit("dataUpdated", { pluginId, entities: cached });
        }

        pollingManager.start(pluginId);
        if (shouldRunInitialFetch(managed.plugin)) {
            void this.runInitialFetch(managed);
        }
        console.debug(`[PluginManager] Emitting layerToggled true for ${pluginId}. Total setup took ${(performance.now() - start).toFixed(2)}ms`);
        dataBus.emit("layerToggled", { pluginId, enabled: true });
    }

    /**
     * Deactivates a plugin and ceases all background activity.
     * This stops the polling cycle, clears in-memory entity buffers, and
     * notifies the UI to remove the corresponding layer from the globe.
     *
     * @param pluginId - The unique identifier of the plugin to disable.
     */
    disablePlugin(pluginId: string): void {
        console.debug(`[PluginManager] disablePlugin called for ${pluginId}`);
        const managed = this.plugins.get(pluginId);
        if (!managed) {
            console.error(`[PluginManager] Plugin ${pluginId} not found during disable`);
            return;
        }
        managed.enabled = false;
        managed.entities = [];
        pollingManager.stop(pluginId);
        emitSourceHealth(managed.plugin, managed.context, {
            status: "idle",
            itemCount: 0,
        });
        console.debug(`[PluginManager] Emitting layerToggled false for ${pluginId}`);
        dataBus.emit("layerToggled", { pluginId, enabled: false });
        dataBus.emit("dataUpdated", { pluginId, entities: [] });
    }

    /**
     * De-registers a plugin and ceases all activity, removing it from the store.
     *
     * @param pluginId - The unique identifier of the plugin to unregister.
     */
    unregisterPlugin(pluginId: string): void {
        console.debug(`[PluginManager] unregisterPlugin called for ${pluginId}`);
        this.disablePlugin(pluginId);
        this.plugins.delete(pluginId);
        cacheLayer.invalidate(pluginId);
        dataBus.emit("pluginUnregistered", { pluginId });
    }

    /**
     * Convenience method to toggle a plugin's enabled state.
     * Primarily used by UI switch components in the Layers or Marketplace panels.
     *
     * @param pluginId - The ID of the plugin to toggle.
     */
    togglePlugin(pluginId: string): void {
        const managed = this.plugins.get(pluginId);
        if (!managed) return;
        if (managed.enabled) {
            this.disablePlugin(pluginId);
        } else {
            this.enablePlugin(pluginId);
        }
    }

    /**
     * Manually triggers a data fetch for a plugin, bypassing the polling interval.
     * Useful for timeline scrubbing, playback, or on-demand refreshes when
     * the user interacts with specific time windows.
     *
     * @param pluginId - The ID of the plugin to refresh.
     * @param timeRange - The new temporal window for the data request.
     * @returns A promise that resolves when the new data is fetched and processed.
     */
    async fetchForPlugin(pluginId: string, timeRange: TimeRange): Promise<void> {
        const managed = this.plugins.get(pluginId);
        if (!managed || !managed.enabled) return;
        managed.context.timeRange = timeRange;
        const started = performance.now();
        emitSourceHealth(managed.plugin, managed.context, {
            status: "loading",
            lastAttemptAt: Date.now(),
        });
        const entities = await managed.plugin.fetch(timeRange);
        emitSourceHealth(managed.plugin, managed.context, {
            latencyMs: Math.round(performance.now() - started),
        });
        this.handleDataUpdate(pluginId, entities);
    }

    private async runInitialFetch(managed: ManagedPlugin): Promise<void> {
        const { plugin, entities, context } = managed;
        try {
            const started = performance.now();
            emitSourceHealth(plugin, context, {
                status: "loading",
                lastAttemptAt: Date.now(),
            });
            const next = await plugin.fetch(context.timeRange);
            if (!Array.isArray(next)) return;

            const serverConfig = plugin.getServerConfig?.();
            const isWsOnly = plugin.getPollingInterval() <= 0 && serverConfig?.pollingIntervalMs === 0;
            if (next.length === 0 && isWsOnly && entities.length > 0) {
                return;
            }
            emitSourceHealth(plugin, context, {
                latencyMs: Math.round(performance.now() - started),
            });
            this.handleDataUpdate(plugin.id, next);
        } catch (err: unknown) {
            dataBus.emit("layerLoadingChanged", { pluginId: plugin.id, loading: false });
            context.onError(err instanceof Error ? err : new Error(String(err)));
        }
    }

    /**
     * Returns the management wrapper for a specific plugin ID.
     * Used internally by rendering components to check individual plugin state.
     *
     * @param pluginId - The unique ID of the plugin.
     * @returns The ManagedPlugin state object or undefined.
     */
    getPlugin(pluginId: string): ManagedPlugin | undefined {
        return this.plugins.get(pluginId);
    }

    /**
     * Returns a collection of all managed plugins in the system.
     *
     * @returns An array of all ManagedPlugin instances.
     */
    getAllPlugins(): ManagedPlugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Returns all currently active and enabled plugins.
     * This is the source for the global rendering loop to determine which
     * layers should be active on the globe.
     *
     * @returns An array of enabled ManagedPlugin instances.
     */
    getEnabledPlugins(): ManagedPlugin[] {
        return this.getAllPlugins().filter((p) => p.enabled);
    }

    /**
     * Returns the current entity snapshot for a specific plugin.
     *
     * @param pluginId - The ID of the plugin.
     * @returns An array of current GeoEntities for that plugin.
     */
    getEntities(pluginId: string): GeoEntity[] {
        return this.plugins.get(pluginId)?.entities ?? [];
    }

    /**
     * Aggregates all entities from all enabled plugins into a single array.
     * Used by global analytics or debugging tools to see the entire visible
     * geospatial dataset.
     *
     * @returns A flattened array of all visible GeoEntities.
     */
    getAllEntities(): GeoEntity[] {
        return this.getEnabledPlugins().flatMap((p) => p.entities);
    }

    /**
     * Synchronously updates the time range for all enabled plugins.
     * Used during global timeline changes or playback to ensure all data
     * sources are reflecting the same temporal slice.
     *
     * @param timeRange - The global time range to apply.
     * @returns A promise that settles after all fetch attempts are complete.
     */
    async updateTimeRange(timeRange: TimeRange): Promise<void> {
        const promises = this.getEnabledPlugins().map((managed) => this.fetchForPlugin(managed.plugin.id, timeRange));
        await Promise.allSettled(promises);
    }

    /**
     * Sets the global maximum age for the data config cache.
     * Determines how long entities remain in the fast-access cache layer
     * before requiring a fresh fetch.
     *
     * @param age - Maximum cache lifetime in milliseconds.
     */
    setCacheMaxAge(age: number): void {
        this.configCacheMaxAge = age;
    }

    /**
     * Resolves a plugin manifest into a live instance and registers it.
     * This is the core engine for the marketplace and dynamic loading,
     * instantiating the correct loader strategy (Static, Proxied, etc.)
     * based on the manifest declarations.
     *
     * @param manifest - The PluginManifest configuration to load.
     * @returns A promise that resolves when the plugin is fully registered and initialized.
     */
    async loadFromManifest(manifest: PluginManifest): Promise<void> {
        const plugin = await loadPluginFromManifest(manifest);
        if (manifest.id && plugin.id !== manifest.id) {
            console.warn(`[PluginManager] Overriding plugin ID from internal '${plugin.id}' to manifest ID '${manifest.id}'`);
            plugin.id = manifest.id;
        }
        this.loadedManifests.set(manifest.id, manifest);
        await this.registerPlugin(plugin);
    }

    /**
     * Retrieves the original manifest used to load a specific plugin.
     * Useful for checking plugin capabilities or marketplace metadata
     * after the plugin has been instantiated.
     *
     * @param pluginId - The ID of the plugin.
     * @returns The PluginManifest if available, otherwise undefined.
     */
    getManifest(pluginId: string): PluginManifest | undefined {
        return this.loadedManifests.get(pluginId);
    }

    /**
     * Tears down the entire plugin management system.
     * Stops all polling, calls destroy on all plugins, and clears the registry.
     * Essential for hot-module reloading and clean application shutdown.
     */
    destroy(): void {
        pollingManager.stopAll();
        this.plugins.forEach((managed) => {
            try {
                managed.plugin.destroy();
            } catch {
                // Ignore destroy errors
            }
        });
        this.plugins.clear();
    }

    /**
     * Orchestrates the internal data flow when a plugin receives new entities.
     * This updates the in-memory cache, commits to the persistent cache layer,
     * emits to the DataBus, and clears the loading state in the UI.
     *
     * @param pluginId - The ID of the plugin providing the update.
     * @param entities - The new array of GeoEntities.
     */
    private handleDataUpdate(pluginId: string, entities: GeoEntity[]): void {
        const managed = this.plugins.get(pluginId);
        if (!managed) return;
        let normalizedEntities = normalizeAviationEntities(pluginId, entities).map((entity) => ({
            ...entity,
            pluginId,
        }));

        const sourceHealthPatch = (entities as EntitiesWithSourceHealth).__wwvSourceHealthPatch;
        const currentHealth = sourceHealthPatch ?? useStore.getState().sourceHealthByPlugin?.[pluginId];
        const shouldPreserveStarlink = pluginId === "satellites"
            && normalizedEntities.every((entity) => !isStarlinkEntity(entity))
            && managed.entities.some(isStarlinkEntity)
            && (currentHealth?.status === "degraded" || currentHealth?.status === "error" || currentHealth?.status === "stale");

        if (shouldPreserveStarlink) {
            const previousStarlink = managed.entities.filter(isStarlinkEntity);
            normalizedEntities = [
                ...normalizedEntities.filter((entity) => !isStarlinkEntity(entity)),
                ...previousStarlink,
            ];
        }
        managed.entities = normalizedEntities;

        cacheLayer.set(pluginId, normalizedEntities, this.configCacheMaxAge);
        dataBus.emit("dataUpdated", { pluginId, entities: normalizedEntities });
        emitSourceHealth(managed.plugin, managed.context, {
            status: shouldPreserveStarlink ? "degraded" : currentHealth?.status === "degraded" ? "degraded" : "healthy",
            itemCount: normalizedEntities.length,
            lastSuccessAt: Date.now(),
            lastErrorMessage: currentHealth?.status === "degraded" ? currentHealth.lastErrorMessage ?? null : null,
            sources: currentHealth?.sources,
        });

        // Clear loading indicator once first data arrives
        dataBus.emit("layerLoadingChanged", { pluginId, loading: false });
    }
}

export const pluginManager = new PluginManager();
