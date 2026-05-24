/**
 * @file DeclarativePlugin.ts
 * @description Generic WorldPlugin implementation for declarative (JSON-only) plugins.
 * Note: This runtime is legacy and primarily used as a fallback for simple data layers.
 */

import type {
    WorldPlugin,
    GeoEntity,
    TimeRange,
    PluginContext,
    LayerConfig,
    CesiumEntityOptions,
    PluginCategory,
} from "../PluginTypes";
import type { PluginManifest } from "../PluginManifest";
import type { SourceHealth } from "@/core/state/sourceHealthSlice";
import { dataBus } from "@/core/data/DataBus";
import { mapGeoJsonToEntities } from "./mapGeoJsonToEntities";
import { mapJsonToEntities } from "./mapJsonToEntities";

type EntitiesWithSourceHealth = GeoEntity[] & {
    __wwvSourceHealthPatch?: Partial<SourceHealth>;
};

/**
 * A generic plugin implementation that derives its logic from a JSON manifest.
 */
export class DeclarativePlugin implements WorldPlugin {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly icon: string;
    readonly category: PluginCategory;
    readonly version: string;

    private context: PluginContext | null = null;

    constructor(private readonly manifest: PluginManifest) {
        this.id = manifest.id;
        this.name = manifest.name;
        this.description = manifest.description ?? "";
        this.icon = manifest.icon ?? "📦";
        this.category = manifest.category as PluginCategory;
        this.version = manifest.version;
    }

    /**
     * Initializes the plugin with the provided context.
     *
     * @param ctx - The host context provided by the manager.
     * @returns A promise that resolves when initialization is complete.
     */
    async initialize(ctx: PluginContext): Promise<void> {
        this.context = ctx;
    }

    /**
     * Cleans up internal state and stops all active processes.
     */
    destroy(): void {
        this.context = null;
    }

    /**
     * Fetches fresh data from the remote data source defined in the manifest.
     *
     * @param _timeRange - The current globe time range (unused in this implementation).
     * @returns A promise resolving to an array of GeoEntities.
     */
    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        const ds = this.manifest.dataSource;
        if (!ds) return [];

        try {
            const url = this.buildUrl(ds.url);
            const headers = this.buildHeaders();

            const res = await fetch(url, {
                method: ds.method ?? "GET",
                headers,
                ...(ds.body ? { body: JSON.stringify(ds.body) } : {}),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            const entities = this.parseResponse(data) as EntitiesWithSourceHealth;
            const patch = this.sourceHealthFromResponse(data, entities.length);
            if (patch) {
                Object.defineProperty(entities, "__wwvSourceHealthPatch", {
                    value: patch,
                    enumerable: false,
                });
                dataBus.emit("sourceHealthChanged", {
                    pluginId: this.id,
                    patch,
                });
            }
            return entities;
        } catch (err) {
            console.error(`[DeclarativePlugin:${this.id}] Fetch error:`, err);
            return [];
        }
    }

    /**
     * Retrieves the polling interval from the manifest configuration.
     *
     * @returns The poll interval in milliseconds (defaults to 30s).
     */
    getPollingInterval(): number {
        return this.manifest.dataSource?.pollInterval ?? 30_000;
    }

    /**
     * Returns the visual configuration for the map layer.
     *
     * @returns The LayerConfig object.
     */
    getLayerConfig(): LayerConfig {
        const r = this.manifest.rendering;
        return {
            color: r?.color ?? "#3b82f6",
            clusterEnabled: r?.clusterEnabled ?? true,
            clusterDistance: r?.clusterDistance ?? 40,
            maxEntities: r?.maxEntities,
        };
    }

    /**
     * Determines how a single GeoEntity should be represented on the Cesium globe.
     *
     * @param entity - The entity to render.
     * @returns The Cesium-specific rendering options.
     */
    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const r = this.manifest.rendering;
        const type = r?.entityType === "billboard" ? "billboard" : "point";
        return {
            type,
            color: r?.color ?? "#3b82f6",
            size: r?.maxEntities ? undefined : 6,
            iconUrl: r?.icon,
            labelText: entity.label ?? undefined,
        };
    }

    // ── Private helpers ─────────────────────────────────────

    private buildUrl(base: string): string {
        const auth = this.manifest.dataSource?.auth;
        if (auth?.type !== "query") return base;

        const value = this.resolveEnvVar(auth.envVar);
        if (!value) return base;

        const sep = base.includes("?") ? "&" : "?";
        return `${base}${sep}${auth.key}=${encodeURIComponent(value)}`;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            ...(this.manifest.dataSource?.headers ?? {}),
        };
        const auth = this.manifest.dataSource?.auth;
        if (auth?.type === "header") {
            const value = this.resolveEnvVar(auth.envVar);
            if (value) headers[auth.key] = value;
        }
        return headers;
    }

    private resolveEnvVar(name: string): string | undefined {
        if (typeof process !== "undefined" && process.env) {
            return process.env[name] ?? undefined;
        }
        return undefined;
    }

    private parseResponse(data: unknown): GeoEntity[] {
        const format = this.manifest.dataSource?.format ?? "json";
        const mapping = this.manifest.fieldMapping;
        if (!mapping) return [];

        if (format === "geojson") {
            return mapGeoJsonToEntities(data, mapping, this.id);
        }
        return mapJsonToEntities(data, mapping, this.id, this.manifest.dataSource?.arrayPath);
    }

    private sourceHealthFromResponse(data: unknown, itemCount: number): Partial<SourceHealth> | null {
        if (!data || typeof data !== "object" || Array.isArray(data)) return null;
        const record = data as Record<string, unknown>;
        const sources = Array.isArray(record.sources)
            ? record.sources.flatMap((source) => {
                if (!source || typeof source !== "object" || Array.isArray(source)) return [];
                const detail = source as Record<string, unknown>;
                return [{
                    sourceName: String(detail.sourceName ?? detail.name ?? "Source"),
                    scope: String(detail.scope ?? "global"),
                    ok: Boolean(detail.ok),
                    count: typeof detail.count === "number" && Number.isFinite(detail.count) ? detail.count : 0,
                    errorMessage: typeof detail.errorMessage === "string" ? detail.errorMessage : undefined,
                    latencyMs: typeof detail.latencyMs === "number" && Number.isFinite(detail.latencyMs) ? detail.latencyMs : undefined,
                }];
            })
            : undefined;
        if (!sources?.length && !record.sourceMode && !record.error) return null;

        const failedSources = sources?.filter((source) => !source.ok) ?? [];
        return {
            status: failedSources.length > 0 ? "degraded" : itemCount > 0 ? "healthy" : "idle",
            sourceName: typeof record.sourceMode === "string"
                ? record.sourceMode.replace(/-/g, " ")
                : this.name,
            sourceUrl: this.manifest.dataSource?.url,
            sourceType: "rest",
            fallbackActive: record.sourceMode === "opensky-fallback" || Boolean(record.fallbackActive),
            itemCount,
            sources,
            lastErrorMessage: failedSources.map((source) => source.errorMessage).filter(Boolean).join("; ")
                || (typeof record.error === "string" ? record.error : null),
        };
    }
}
