"use client";

import { useMemo, useState } from "react";
import {
    Clipboard,
    Crosshair,
    RefreshCw,
    Trash2,
} from "lucide-react";
import { cacheLayer } from "@/core/data/CacheLayer";
import {
    buildFeedDiagnostics,
    describeFeedState,
    formatTime,
    getPluginSourceType,
    labelForFeedState,
    toneForFeedState,
} from "@/core/diagnostics/feedHealth";
import { pluginManager } from "@/core/plugins/PluginManager";
import { useStore } from "@/core/state/store";
import { trackEvent } from "@/lib/analytics";
import { BUILT_IN_GLOBAL_FEED_IDS } from "@/plugins/globalFeeds/types";
import type { WorldPlugin } from "@/core/plugins/PluginTypes";

const COMPOSITE_FEED_IDS = new Set<string>(BUILT_IN_GLOBAL_FEED_IDS);

function canRefreshPlugin(plugin: WorldPlugin) {
    const config = plugin.getServerConfig?.();
    if (config?.transportMode === "websocket" || config?.transportMode === "static" || config?.transportMode === "manual") {
        return false;
    }
    return plugin.getPollingInterval() > 0;
}

function getPriorityOptions(pluginId: string) {
    if (pluginId === "aviation") {
        return [
            { value: "wwv-engine", label: "WWV engine first" },
            { value: "opensky", label: "OpenSky fallback first" },
        ];
    }
    if (COMPOSITE_FEED_IDS.has(pluginId)) {
        return [
            { value: "global-first", label: "Global source first" },
            { value: "france-first", label: "France source first" },
        ];
    }
    return null;
}

export function FeedHealthCenter() {
    const layers = useStore((s) => s.layers);
    const entitiesByPlugin = useStore((s) => s.entitiesByPlugin);
    const sourceHealthByPlugin = useStore((s) => s.sourceHealthByPlugin);
    const dataConfig = useStore((s) => s.dataConfig);
    const updatePluginSettings = useStore((s) => s.updatePluginSettings);
    const setSelectedEntity = useStore((s) => s.setSelectedEntity);
    const setHighlightLayerId = useStore((s) => s.setHighlightLayerId);
    const setConfigPanelOpen = useStore((s) => s.setConfigPanelOpen);
    const setActiveLayerPanelTab = useStore((s) => s.setActiveLayerPanelTab);
    const clearEntities = useStore((s) => s.clearEntities);
    const setEntityCount = useStore((s) => s.setEntityCount);
    const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
    const [copied, setCopied] = useState<string | null>(null);
    const [armedClear, setArmedClear] = useState<string | null>(null);

    const rows = useMemo(() => pluginManager.getAllPlugins().map(({ plugin, enabled: managedEnabled }) => {
        const layer = layers[plugin.id];
        const entityCount = (entitiesByPlugin[plugin.id] ?? []).length || layer?.entityCount || 0;
        const pollingIntervalMs = dataConfig.pollingIntervals[plugin.id] ?? plugin.getPollingInterval();
        return {
            plugin,
            diagnostics: buildFeedDiagnostics({
                plugin,
                enabled: Boolean(layer?.enabled ?? managedEnabled),
                layer,
                health: sourceHealthByPlugin[plugin.id],
                entityCount,
                pollingIntervalMs,
            }),
        };
    }).sort((a, b) => {
        const stateDelta = Number(b.diagnostics.enabled) - Number(a.diagnostics.enabled);
        if (stateDelta !== 0) return stateDelta;
        return a.plugin.name.localeCompare(b.plugin.name);
    }), [dataConfig.pollingIntervals, entitiesByPlugin, layers, sourceHealthByPlugin]);

    const refreshFeed = async (pluginId: string) => {
        const managed = pluginManager.getPlugin(pluginId);
        if (!managed || !layers[pluginId]?.enabled || !canRefreshPlugin(managed.plugin)) return;
        setRefreshing((prev) => ({ ...prev, [pluginId]: true }));
        try {
            await pluginManager.fetchForPlugin(pluginId, useStore.getState().timeRange);
            trackEvent("feed-refresh", { plugin: pluginId, surface: "feed-health-center" });
        } finally {
            setRefreshing((prev) => ({ ...prev, [pluginId]: false }));
        }
    };

    const focusFeed = (pluginId: string) => {
        setSelectedEntity(null);
        setHighlightLayerId(pluginId);
        setConfigPanelOpen(true);
        setActiveLayerPanelTab("data");
        trackEvent("feed-focus", { plugin: pluginId, surface: "feed-health-center" });
    };

    const copyDiagnostics = async (diagnostics: unknown, pluginId: string) => {
        const text = JSON.stringify(diagnostics, null, 2);
        await navigator.clipboard?.writeText(text);
        setCopied(pluginId);
        window.setTimeout(() => setCopied((current) => (current === pluginId ? null : current)), 1_500);
    };

    const clearFeed = (pluginId: string) => {
        if (armedClear !== pluginId) {
            setArmedClear(pluginId);
            return;
        }
        cacheLayer.invalidate(pluginId);
        clearEntities(pluginId);
        setEntityCount(pluginId, 0);
        setArmedClear(null);
        trackEvent("feed-cache-clear", { plugin: pluginId, surface: "feed-health-center" });
    };

    return (
      <section className="feed-health-center">
        <div className="feed-health-center__header">
          <div>
            <div className="local-settings__section-title">Feed Health Center</div>
            <p>One status model for enabled, idle, degraded, errored, and disabled feeds.</p>
          </div>
        </div>
        <div className="feed-health-center__list">
          {rows.map(({ plugin, diagnostics }) => {
              const tone = toneForFeedState(diagnostics.runtimeState);
              const priorityOptions = getPriorityOptions(plugin.id);
              const priorityValue = String(dataConfig.pluginSettings[plugin.id]?.sourcePriority ?? priorityOptions?.[0]?.value ?? "");
              const refreshable = diagnostics.enabled && canRefreshPlugin(plugin);
              return (
                <article key={plugin.id} className={`feed-health-row feed-health-row--${tone}`}>
                  <div className="feed-health-row__main">
                    <div className="feed-health-row__top">
                      <span>{plugin.name}</span>
                      <span>{labelForFeedState(diagnostics.runtimeState)}</span>
                    </div>
                    <div className="feed-health-row__summary">
                      {describeFeedState(diagnostics.runtimeState)}
                      {diagnostics.fallbackActive ? " · fallback active" : ""}
                      {diagnostics.latestError ? ` · ${diagnostics.latestError}` : ""}
                      {diagnostics.sourceNote ? ` · ${diagnostics.sourceNote}` : ""}
                    </div>
                    <div className="feed-health-row__grid">
                      <span><b>Entities</b>{diagnostics.entityCount.toLocaleString()}</span>
                      <span><b>Last success</b>{formatTime(diagnostics.lastSuccessAt)}</span>
                      <span><b>Last attempt</b>{formatTime(diagnostics.lastAttemptAt)}</span>
                      <span><b>Source</b>{diagnostics.sourceName ?? getPluginSourceType(plugin)}</span>
                      <span><b>Type</b>{diagnostics.sourceType}</span>
                      <span><b>Polling</b>{diagnostics.pollingLabel}</span>
                      <span><b>Freshness</b>{diagnostics.sourceFreshness}</span>
                    </div>
                    {priorityOptions && (
                      <label className="feed-health-row__priority">
                        <span>Source priority</span>
                        <select
                          value={priorityValue}
                          onChange={(event) => {
                              updatePluginSettings(plugin.id, { sourcePriority: event.target.value });
                              trackEvent("feed-source-priority", { plugin: plugin.id, priority: event.target.value });
                          }}
                        >
                          {priorityOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {diagnostics.sources?.length ? (
                      <div className="feed-health-row__sources">
                        {diagnostics.sources.map((source) => (
                          <span key={`${plugin.id}-${source.scope}-${source.sourceName}`}>
                            {source.ok ? "ok" : "error"}
                            {" · "}
                            {source.sourceName}
                            {" · "}
                            {source.count.toLocaleString()}
                            {typeof source.latencyMs === "number" ? ` · ${source.latencyMs} ms` : ""}
                            {source.errorMessage ? ` · ${source.errorMessage}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="feed-health-row__actions">
                    <button
                      type="button"
                      onClick={() => void refreshFeed(plugin.id)}
                      disabled={!refreshable || refreshing[plugin.id]}
                      title={refreshable ? "Refresh now" : "Refresh unavailable"}
                      aria-label={`Refresh ${plugin.name}`}
                    >
                      <RefreshCw size={13} />
                    </button>
                    <button type="button" onClick={() => focusFeed(plugin.id)} title="Focus feed info" aria-label={`Focus ${plugin.name}`}>
                      <Crosshair size={13} />
                    </button>
                    <button type="button" onClick={() => void copyDiagnostics(diagnostics, plugin.id)} title="Copy diagnostics JSON" aria-label={`Copy diagnostics for ${plugin.name}`}>
                      <Clipboard size={13} />
                      {copied === plugin.id ? "Copied" : null}
                    </button>
                    <button
                      type="button"
                      className={armedClear === plugin.id ? "feed-health-row__clear feed-health-row__clear--armed" : "feed-health-row__clear"}
                      onClick={() => clearFeed(plugin.id)}
                      title={armedClear === plugin.id ? "Confirm clear entities and cache" : "Clear cache/entities"}
                      aria-label={armedClear === plugin.id ? `Confirm clear ${plugin.name}` : `Clear ${plugin.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </article>
              );
          })}
        </div>
      </section>
    );
}
