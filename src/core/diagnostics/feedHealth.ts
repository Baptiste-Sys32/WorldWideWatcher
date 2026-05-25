import type { WorldPlugin } from "@/core/plugins/PluginTypes";
import type { LayerState } from "@/core/state/layersSlice";
import type { SourceHealth, SourceHealthStatus } from "@/core/state/sourceHealthSlice";

export type FeedRuntimeState = "disabled" | "healthy" | "idle" | "degraded" | "error" | "loading";
export type FeedHealthTone = "ok" | "warn" | "bad" | "info";

export interface FeedDiagnostics {
    id: string;
    name: string;
    enabled: boolean;
    runtimeState: FeedRuntimeState;
    healthStatus: SourceHealthStatus | "disabled";
    entityCount: number;
    sourceType: string;
    sourceName?: string;
    sourceUrl?: string;
    sourceNote?: string;
    pollingIntervalMs: number;
    pollingLabel: string;
    lastSuccessAt?: number;
    lastAttemptAt?: number;
    lastErrorAt?: number;
    latestError?: string | null;
    sourceFreshness: string;
    fallbackActive: boolean;
    sources: SourceHealth["sources"];
}

const SOURCE_NOTES: Record<string, string> = {
    aviation: "Uses the local OpenSky fallback when the cloud aviation snapshot is unavailable.",
    "undersea-cables": "Uses the local Submarine Cable Map proxy; a cloud REST snapshot is not required.",
    "air-defense": "Static ADIZ overlay; zero fetched entities does not indicate a broken cloud feed.",
    "nuclear-facilities": "Uses embedded static GeoJSON from the plugin bundle rather than the cloud REST snapshot.",
};

export function formatTime(value?: number): string {
    if (!value) return "Never";
    return new Date(value).toLocaleString();
}

export function formatPollingInterval(intervalMs: number): string {
    if (intervalMs <= 0) return "Push / manual";
    if (intervalMs < 60_000) return `${Math.round(intervalMs / 1000)}s`;
    return `${Math.round(intervalMs / 60_000)} min`;
}

export function getPluginSourceType(plugin: WorldPlugin): string {
    const config = plugin.getServerConfig?.();
    if (config?.transportMode === "websocket") return "Push stream";
    if (config?.transportMode === "static") return "Static";
    if (config?.transportMode === "manual") return "Manual";
    if (config?.transportMode === "polling") return "Polling";
    return plugin.getPollingInterval() > 0 ? "Polling" : "Push / manual";
}

export function getFeedRuntimeState(
    enabled: boolean,
    layer?: Partial<LayerState>,
    health?: SourceHealth,
    entityCount = 0,
): FeedRuntimeState {
    if (!enabled) return "disabled";
    if (layer?.loading || health?.status === "loading") return "loading";
    if (health?.status === "error") return "error";
    if (health?.status === "degraded" || health?.status === "stale") return "degraded";
    if (health?.status === "healthy" && entityCount > 0) return "healthy";
    return "idle";
}

export function toneForFeedState(state: FeedRuntimeState): FeedHealthTone {
    if (state === "healthy") return "ok";
    if (state === "error") return "bad";
    if (state === "degraded" || state === "idle") return "warn";
    return "info";
}

export function labelForFeedState(state: FeedRuntimeState): string {
    if (state === "healthy") return "Healthy";
    if (state === "idle") return "Idle";
    if (state === "degraded") return "Degraded";
    if (state === "error") return "Error";
    if (state === "loading") return "Loading";
    return "Disabled";
}

export function describeFeedState(state: FeedRuntimeState): string {
    if (state === "healthy") return "Active and current";
    if (state === "idle") return "Enabled, no recent source activity or no items";
    if (state === "degraded") return "Partial source failure, usable data retained";
    if (state === "error") return "Source failed and no fresh usable data";
    if (state === "loading") return "Refresh in progress";
    return "Turned off from the layer toggle";
}

export function describeSourceFreshness(health?: SourceHealth): string {
    if (health?.lastSuccessAt) {
        const ageMs = Date.now() - health.lastSuccessAt;
        if (ageMs < 60_000) return "Just updated";
        if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)} min old`;
        if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)} h old`;
        return `${Math.round(ageMs / 86_400_000)} d old`;
    }
    if (health?.lastAttemptAt) return "Attempted, no success yet";
    return "No source activity";
}

export function buildFeedDiagnostics(args: {
    plugin: WorldPlugin;
    enabled: boolean;
    layer?: Partial<LayerState>;
    health?: SourceHealth;
    entityCount: number;
    pollingIntervalMs?: number;
}): FeedDiagnostics {
    const intervalMs = args.pollingIntervalMs ?? args.plugin.getPollingInterval();
    const runtimeState = getFeedRuntimeState(args.enabled, args.layer, args.health, args.entityCount);
    return {
        id: args.plugin.id,
        name: args.plugin.name,
        enabled: args.enabled,
        runtimeState,
        healthStatus: args.enabled ? args.health?.status ?? "idle" : "disabled",
        entityCount: args.entityCount,
        sourceType: args.health?.sourceType ?? getPluginSourceType(args.plugin),
        sourceName: args.health?.sourceName ?? args.plugin.getServerConfig?.()?.sourceName ?? args.plugin.name,
        sourceUrl: args.health?.sourceUrl ?? args.plugin.getServerConfig?.()?.sourceUrl,
        sourceNote: SOURCE_NOTES[args.plugin.id],
        pollingIntervalMs: intervalMs,
        pollingLabel: formatPollingInterval(intervalMs),
        lastSuccessAt: args.health?.lastSuccessAt,
        lastAttemptAt: args.health?.lastAttemptAt,
        lastErrorAt: args.health?.lastErrorAt,
        latestError: args.health?.lastErrorMessage,
        sourceFreshness: describeSourceFreshness(args.health),
        fallbackActive: Boolean(args.health?.fallbackActive),
        sources: args.health?.sources,
    };
}
