"use client";

/**
 * @file index.tsx
 * @module Panels/DataConfig
 * @description Right-side inspector panel for the OLED shell.
 */

import {
    ChevronRight,
    Clock,
    Funnel,
    Globe2,
    Info,
    Layers,
    Power,
    RefreshCw,
    Settings,
} from "lucide-react";
import { useState } from "react";

import { PluginIcon } from "@/components/common/PluginIcon";
import { PluginErrorBoundary } from "@/components/common/PluginErrorBoundary";
import { FilterSection } from "@/components/panels/FilterPanel";
import { dataBus } from "@/core/data/DataBus";
import {
    buildFeedDiagnostics,
    formatPollingInterval,
    getFeedRuntimeState,
    getPluginSourceType,
    labelForFeedState,
    toneForFeedState,
} from "@/core/diagnostics/feedHealth";
import { useIsMobile } from "@/core/hooks/useIsMobile";
import { useResizablePanel } from "@/core/hooks/useResizablePanel";
import { pluginManager } from "@/core/plugins/PluginManager";
import type { WorldPlugin } from "@/core/plugins/PluginTypes";
import { useStore } from "@/core/state/store";
import { trackEvent } from "@/lib/analytics";
import {
    WEATHER_LAYER_META_BY_ID,
    WEATHER_TILE_URL_TEMPLATE,
    type WeatherLayerId,
} from "@/plugins/weather/weatherLayers";

import "./index.css";

type StatusTone = "ok" | "warn" | "bad" | "info";

const REGIONS = [
    { id: "global", label: "Global" },
    { id: "americas", label: "Americas" },
    { id: "europe", label: "Europe" },
    { id: "mena", label: "MENA" },
    { id: "asiaPacific", label: "Asia Pacific" },
    { id: "africa", label: "Africa" },
    { id: "oceania", label: "Oceania" },
    { id: "arctic", label: "Arctic" },
];

const TIME_WINDOWS = ["1h", "6h", "24h", "48h", "7d"] as const;
const RIGHT_PANEL_MODES = ["intel", "feeds", "filters", "settings"] as const;
type RightPanelMode = typeof RIGHT_PANEL_MODES[number];
const RIGHT_PANEL_MODE_META: Record<RightPanelMode, { label: string; Icon: typeof Info }> = {
    intel: { label: "Intel", Icon: Info },
    feeds: { label: "Feeds", Icon: Layers },
    filters: { label: "Filters", Icon: Funnel },
    settings: { label: "Settings", Icon: Settings },
};

/**
 * Formats an arbitrary value into a human-readable string for the inspector table.
 *
 * @param value - Raw value from entity properties or metadata.
 * @returns A concise string representation of the input.
 */
function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "None";
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : "Unknown";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length ? value.map(formatValue).join(", ") : "Empty";
    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return "Object";
        }
    }
    return String(value);
}

/**
 * Formats a latitude or longitude with hemisphere suffixes.
 *
 * @param value - Coordinate value in decimal degrees.
 * @param positive - Hemisphere label for positive values.
 * @param negative - Hemisphere label for negative values.
 * @returns Formatted coordinate string.
 */
function formatCoordinate(value?: number, positive = "N", negative = "S") {
    if (typeof value !== "number" || !Number.isFinite(value)) return "Unknown";
    return `${Math.abs(value).toFixed(5)} ${value >= 0 ? positive : negative}`;
}

/**
 * Formats a timestamp-like value for display.
 *
 * @param value - Timestamp input such as Date, string, or number.
 * @returns Localized time string or a fallback label.
 */
function formatTimestamp(value: unknown) {
    if (!value) return "Unknown";
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return formatValue(value);
    return date.toLocaleString();
}

/**
 * Returns a human-readable polling interval label for a plugin.
 *
 * @param pluginId - The plugin identifier to inspect.
 * @returns Polling interval label for the plugin.
 */
function pollingLabel(pluginId: string) {
    const managed = pluginManager.getPlugin(pluginId);
    if (!managed) return "Unknown";
    try {
        return formatPollingInterval(managed.plugin.getPollingInterval());
    } catch {
        return "Unknown";
    }
}

function sourceTypeLabel(plugin: WorldPlugin) {
    return getPluginSourceType(plugin);
}

function canRefreshPlugin(plugin: WorldPlugin) {
    const config = plugin.getServerConfig?.();
    if (config?.transportMode === "websocket" || config?.transportMode === "static" || config?.transportMode === "manual") {
        return false;
    }
    return plugin.getPollingInterval() > 0;
}

/**
 * Right-side data inspector panel for entities and layer diagnostics.
 *
 * @returns The inspector sidebar component.
 */
export function DataConfigPanel() {
    const isMobile = useIsMobile();
    const { width, startResizing } = useResizablePanel(370, 300, 620, "right");
    const configPanelOpen = useStore((s) => s.configPanelOpen);
    const openMobilePanel = useStore((s) => s.openMobilePanel);
    const setOpenMobilePanel = useStore((s) => s.setOpenMobilePanel);
    const toggleConfigPanel = useStore((s) => s.toggleConfigPanel);
    const selectedEntity = useStore((s) => s.selectedEntity);
    const highlightLayerId = useStore((s) => s.highlightLayerId);
    const activeRightOverlay = useStore((s) => s.activeRightOverlay);
    const setActiveRightOverlay = useStore((s) => s.setActiveRightOverlay);
    const timeWindow = useStore((s) => s.timeWindow);
    const setTimeWindow = useStore((s) => s.setTimeWindow);
    const layers = useStore((s) => s.layers);
    const entitiesByPlugin = useStore((s) => s.entitiesByPlugin);
    const sourceHealthByPlugin = useStore((s) => s.sourceHealthByPlugin);
    const filters = useStore((s) => s.filters);
    const setFilter = useStore((s) => s.setFilter);
    const clearFilters = useStore((s) => s.clearFilters);
    const setHighlightLayerId = useStore((s) => s.setHighlightLayerId);
    const setSelectedEntity = useStore((s) => s.setSelectedEntity);
    const setLayerEnabled = useStore((s) => s.setLayerEnabled);
    const clearEntities = useStore((s) => s.clearEntities);
    const setEntityCount = useStore((s) => s.setEntityCount);
    const setPollingInterval = useStore((s) => s.setPollingInterval);
    const dataConfig = useStore((s) => s.dataConfig);
    const [activeMode, setActiveMode] = useState<RightPanelMode>("intel");

    const isOpen = isMobile ? openMobilePanel === "right" : configPanelOpen;
    const enabledLayerIds = Object.keys(layers).filter((id) => layers[id]?.enabled);
    const fallbackId = pluginManager.getPlugin("aviation")?.plugin.id
        ?? enabledLayerIds[0]
        ?? pluginManager.getAllPlugins()[0]?.plugin.id
        ?? null;
    const pluginId = selectedEntity?.pluginId ?? highlightLayerId ?? fallbackId;
    const managed = pluginId ? pluginManager.getPlugin(pluginId) : null;
    const layer = pluginId ? layers[pluginId] : undefined;
    const entityCount = pluginId
        ? ((entitiesByPlugin[pluginId] ?? []).length || layer?.entityCount || 0)
        : Object.values(layers).reduce((total, item) => total + (item.entityCount ?? 0), 0);
    const sourceHealth = pluginId ? sourceHealthByPlugin[pluginId] : undefined;
    const focusedRuntimeState = getFeedRuntimeState(Boolean(layer?.enabled), layer, sourceHealth, entityCount);
    const weatherMeta = pluginId ? WEATHER_LAYER_META_BY_ID[pluginId as WeatherLayerId] : undefined;
    const legend = managed?.plugin.getLegend?.() ?? [];
    const activePluginFilters = pluginId ? filters[pluginId] ?? {} : {};
    const activeFilterCount = Object.keys(activePluginFilters).length;
    const feedLayers = pluginManager.getAllPlugins()
        .map((itemManaged) => {
            const id = itemManaged.plugin.id;
            return {
                id,
                managed: itemManaged,
                layer: layers[id] ?? { enabled: itemManaged.enabled, loading: false, entityCount: 0 },
                entities: entitiesByPlugin[id] ?? [],
            };
        })
        .sort((a, b) => {
            const enabledDelta = Number(Boolean(b.layer.enabled)) - Number(Boolean(a.layer.enabled));
            if (enabledDelta !== 0) return enabledDelta;
            return a.managed.plugin.name.localeCompare(b.managed.plugin.name);
        });
    const enabledFeedLayers = feedLayers.filter((item) => Boolean(item.layer.enabled));

    const selectedProps = selectedEntity
        ? Object.entries(selectedEntity.properties ?? {}).slice(0, 8)
        : [];
    const DetailComp = selectedEntity ? managed?.plugin.getDetailComponent?.() : null;
    const SidebarComp = !selectedEntity ? managed?.plugin.getSidebarComponent?.() : null;

    const statusTone: StatusTone = selectedEntity ? "ok" : managed ? toneForFeedState(focusedRuntimeState) : "bad";
    const statusTitle = selectedEntity ? "Entity Selected" : managed ? `Layer ${labelForFeedState(focusedRuntimeState)}` : "No Focus";
    const statusText = selectedEntity
        ? "Showing the selected entity from the active globe layer."
            : layer?.enabled
                ? `${entityCount.toLocaleString()} entities currently loaded for this feed.`
            : managed
                ? "Layer is available but not currently enabled."
                : "Select a feed or globe entity to populate the inspector.";

    const rows = selectedEntity
        ? [
            ["Plugin", managed?.plugin.name ?? selectedEntity.pluginId],
            ["Latitude", formatCoordinate(selectedEntity.latitude, "N", "S")],
            ["Longitude", formatCoordinate(selectedEntity.longitude, "E", "W")],
            ["Altitude", selectedEntity.altitude === undefined ? "Unknown" : `${Math.round(selectedEntity.altitude).toLocaleString()} m`],
            ["Speed", selectedEntity.speed === undefined ? "Unknown" : formatValue(selectedEntity.speed)],
            ["Heading", selectedEntity.heading === undefined ? "Unknown" : `${selectedEntity.heading.toFixed(1)} deg`],
            ["Updated", formatTimestamp(selectedEntity.timestamp)],
        ]
        : [
            ["Provider", managed?.plugin.name ?? "None"],
            ["Category", managed?.plugin.category ?? "None"],
            ["Version", managed?.plugin.version ?? "Unknown"],
            ["Entities", entityCount.toLocaleString()],
            ["Polling", pluginId ? pollingLabel(pluginId) : "Unknown"],
            ["Rendering", managed?.plugin.getLayerConfig().disableDefaultRendering ? "Plugin managed" : "Core renderer"],
        ];

    const closePanel = () => {
        if (activeRightOverlay) {
            setActiveRightOverlay(null);
            return;
        }
        if (isMobile) setOpenMobilePanel("right");
        else toggleConfigPanel();
        trackEvent("panel-toggle", { panel: "right", open: false });
    };

    const cycleRightPanelMode = () => {
        setActiveRightOverlay(null);
        const index = RIGHT_PANEL_MODES.indexOf(activeMode);
        setActiveMode(RIGHT_PANEL_MODES[(index + 1) % RIGHT_PANEL_MODES.length]);
    };

    const modeTitle = RIGHT_PANEL_MODE_META[activeMode].label;
    const title = activeRightOverlay === "map"
        ? "Map"
        : activeRightOverlay === "filters"
            ? "Filters"
            : activeMode === "intel"
                ? selectedEntity?.label || selectedEntity?.id || managed?.plugin.name || "Intel"
                : modeTitle;
    const subtitle = activeRightOverlay === "map"
        ? "region presets"
        : activeRightOverlay === "filters"
            ? "time frame and data filters"
            : activeMode === "feeds"
                ? `${enabledLayerIds.length} enabled feeds`
                : activeMode === "filters"
                    ? "time frame and data filters"
                    : activeMode === "settings"
                        ? "polling and source status"
                        : selectedEntity
                            ? `${managed?.plugin.category ?? selectedEntity.pluginId} entity`
                            : managed
                                ? `${managed.plugin.category} feed`
                                : "local context";

    const renderOverlay = () => {
        if (activeRightOverlay === "map") {
            return (
              <div className="config-panel__content">
                <section className="inspector-card">
                  <div className="inspector-card__title">Region Presets</div>
                  <div className="region-preset-grid">
                    {REGIONS.map((region) => (
                      <button
                        key={region.id}
                        type="button"
                        className="region-preset"
                        onClick={() => {
                            dataBus.emit("cameraPreset", { presetId: region.id });
                            trackEvent("region-select", { region: region.id });
                            setActiveRightOverlay(null);
                        }}
                      >
                        <Globe2 size={15} />
                        <span>{region.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            );
        }

        if (activeRightOverlay === "filters") {
            return (
              <div className="config-panel__content">
                <section className="inspector-card">
                  <div className="inspector-card__title">Time Frame</div>
                  <div className="time-window-grid">
                    {TIME_WINDOWS.map((tw) => (
                      <button
                        type="button"
                        key={tw}
                        className={`time-window-btn ${timeWindow === tw ? "time-window-btn--active" : ""}`}
                        onClick={() => {
                            setTimeWindow(tw);
                            const range = useStore.getState().timeRange;
                            pluginManager.updateTimeRange(range);
                            trackEvent("time-window-change", { window: tw });
                        }}
                      >
                        <Clock size={14} />
                        <span>{tw}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="inspector-card">
                  <div className="inspector-card__title">Entity Filters</div>
                  <FilterSection />
                </section>
              </div>
            );
        }

        return null;
    };

    const toggleFeed = (id: string, enabled: boolean) => {
        if (enabled) {
            pluginManager.disablePlugin(id);
            setLayerEnabled(id, false);
            clearEntities(id);
            setEntityCount(id, 0);
            trackEvent("feed-toggle", { plugin: id, enabled: false, surface: "right-panel" });
            return;
        }

        setLayerEnabled(id, true);
        void pluginManager.enablePlugin(id);
        setHighlightLayerId(id);
        trackEvent("feed-toggle", { plugin: id, enabled: true, surface: "right-panel" });
    };

    const renderFeedsMode = () => (
      <div className="config-panel__content">
        {enabledFeedLayers.length === 0 ? (
          <section className="status-card status-card--info">
            <span className="status-card__title">Feeds</span>
            <span className="status-card__text">No feeds are enabled.</span>
          </section>
        ) : enabledFeedLayers.map(({ id, managed: itemManaged, layer: itemLayer, entities }) => {
            if (!itemManaged) return null;
            const isEnabled = Boolean(itemLayer?.enabled);
            const itemHealth = sourceHealthByPlugin[id];
            const refreshable = canRefreshPlugin(itemManaged.plugin);
            const diagnostics = buildFeedDiagnostics({
                plugin: itemManaged.plugin,
                enabled: isEnabled,
                layer: itemLayer,
                health: itemHealth,
                entityCount: entities.length || itemLayer?.entityCount || 0,
                pollingIntervalMs: dataConfig.pollingIntervals[id] ?? itemManaged.plugin.getPollingInterval(),
            });
            return (
              <section key={id} className={`inspector-card feed-card ${isEnabled ? "feed-card--on" : "feed-card--off"}`}>
                <div className="feed-legend-card__header">
                  <div className="inspector-card__title">
                    <PluginIcon icon={itemManaged.plugin.icon} size={15} />
                    <span>{itemManaged.plugin.name}</span>
                  </div>
                  <div className="feed-row-actions">
                    <button
                      type="button"
                      className="feed-legend-card__clear"
                      onClick={() => {
                          setSelectedEntity(null);
                          setHighlightLayerId(id);
                          setActiveMode("intel");
                      }}
                    >
                      Info
                    </button>
                    <button
                      type="button"
                      className="feed-legend-card__clear"
                      disabled={!refreshable || !isEnabled}
                      title={refreshable && isEnabled ? "Refresh feed" : "Refresh unavailable"}
                      aria-label={refreshable && isEnabled ? "Refresh feed" : "Refresh unavailable"}
                      onClick={() => {
                          void pluginManager.fetchForPlugin(id, useStore.getState().timeRange);
                          trackEvent("feed-refresh", { plugin: id, surface: "right-panel" });
                      }}
                    >
                      <RefreshCw size={13} />
                    </button>
                    <button
                      type="button"
                      className={`feed-power-btn ${isEnabled ? "feed-power-btn--on" : "feed-power-btn--off"}`}
                      onClick={() => toggleFeed(id, isEnabled)}
                      title={isEnabled ? "Turn feed off" : "Turn feed on"}
                      aria-label={isEnabled ? "Turn feed off" : "Turn feed on"}
                      aria-pressed={isEnabled}
                    >
                      <Power size={13} />
                    </button>
                  </div>
                </div>
                <table className="kv-table">
                  <tbody>
                    <tr><td>Entities</td><td>{diagnostics.entityCount.toLocaleString()}</td></tr>
                    <tr><td>State</td><td>{diagnostics.enabled ? "On" : "Off"}</td></tr>
                    <tr><td>Health</td><td>{labelForFeedState(diagnostics.runtimeState)}</td></tr>
                    <tr><td>Source</td><td>{diagnostics.sourceType}</td></tr>
                    <tr><td>Polling</td><td>{diagnostics.pollingLabel}</td></tr>
                    <tr><td>Freshness</td><td>{diagnostics.sourceFreshness}</td></tr>
                  </tbody>
                </table>
              </section>
            );
        })}
      </div>
    );

    const renderFiltersMode = () => (
      <div className="config-panel__content">
        <section className="inspector-card">
          <div className="inspector-card__title">Time Frame</div>
          <div className="time-window-grid">
            {TIME_WINDOWS.map((tw) => (
              <button
                type="button"
                key={tw}
                className={`time-window-btn ${timeWindow === tw ? "time-window-btn--active" : ""}`}
                onClick={() => {
                    setTimeWindow(tw);
                    const range = useStore.getState().timeRange;
                    pluginManager.updateTimeRange(range);
                    trackEvent("time-window-change", { window: tw });
                }}
              >
                <Clock size={14} />
                <span>{tw}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="inspector-card">
          <div className="inspector-card__title">Entity Filters</div>
          <FilterSection />
        </section>
      </div>
    );

    const renderSettingsMode = () => (
      <div className="config-panel__content">
        <section className="inspector-card">
          <div className="inspector-card__title">Cache</div>
          <table className="kv-table">
            <tbody>
              <tr><td>Enabled</td><td>{dataConfig.cacheEnabled ? "Yes" : "No"}</td></tr>
              <tr><td>Max age</td><td>{Math.round(dataConfig.cacheMaxAge / 60000).toLocaleString()} min</td></tr>
              <tr><td>Retries</td><td>{dataConfig.retryAttempts.toLocaleString()}</td></tr>
            </tbody>
          </table>
        </section>
        {enabledFeedLayers.map(({ id, managed: itemManaged }) => itemManaged ? (
          <section key={id} className="inspector-card">
            <div className="inspector-card__title">{itemManaged.plugin.name}</div>
            <table className="kv-table">
              <tbody>
                <tr><td>Source</td><td>{sourceTypeLabel(itemManaged.plugin)}</td></tr>
                <tr><td>Health</td><td>{sourceHealthByPlugin[id]?.status ?? "idle"}</td></tr>
              </tbody>
            </table>
            <label className="polling-setting-row">
              <span>Polling seconds</span>
              <input
                type="number"
                min={0}
                step={5}
                value={Math.round((dataConfig.pollingIntervals[id] ?? itemManaged.plugin.getPollingInterval()) / 1000)}
                onChange={(event) => setPollingInterval(id, Math.max(0, Number(event.target.value) || 0) * 1000)}
              />
            </label>
            {sourceHealthByPlugin[id]?.sources?.length ? (
              <table className="kv-table">
                <tbody>
                  {sourceHealthByPlugin[id].sources?.map((source) => (
                    <tr key={`${id}-${source.scope}-${source.sourceName}`}>
                      <td>{source.sourceName}</td>
                      <td>{source.ok ? "ok" : source.errorMessage ?? "error"} · {source.scope} · {source.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        ) : null)}
      </div>
    );

    return (
      <aside
        className={`sidebar sidebar--right glass-panel oled-inspector ${isMobile ? "sidebar--mobile" : ""} ${isOpen ? "" : "sidebar--closed"}`}
        style={{ width: isMobile ? undefined : width }}
      >
        {!isMobile && (
          <div
            className="resize-handle resize-handle--right"
            onMouseDown={startResizing}
            title="Resize inspector"
          />
        )}

        <div className="panel-header config-panel__header">
          <div className="inspector-heading">
            <div className="panel-mode-cycler" aria-label="Inspector panel mode">
              <button
                type="button"
                className="panel-mode-button"
                onClick={cycleRightPanelMode}
                title={`Current: ${modeTitle}. Click to cycle panel mode.`}
                aria-label={`Current panel mode: ${modeTitle}. Click to cycle.`}
              >
                {activeMode === "intel" && managed
                    ? <PluginIcon icon={managed.plugin.icon} size={15} />
                    : (() => {
                        const { Icon } = RIGHT_PANEL_MODE_META[activeMode];
                        return <Icon size={15} />;
                    })()}
              </button>
              <div className="panel-mode-dots" aria-hidden="true">
                {RIGHT_PANEL_MODES.map((mode) => (
                  <span key={mode} className={`panel-mode-dot ${activeMode === mode ? "panel-mode-dot--active" : ""}`} />
                ))}
              </div>
            </div>
            <div className="inspector-heading__text">
              <div className="config-panel__title">{title}</div>
              <div className="config-panel__subtitle">{subtitle}</div>
            </div>
          </div>
          <button
            type="button"
            className="collapse-btn"
            onClick={closePanel}
            title="Hide inspector"
            aria-label="Hide inspector"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {activeRightOverlay ? renderOverlay() : activeMode === "feeds" ? renderFeedsMode() : activeMode === "filters" ? renderFiltersMode() : activeMode === "settings" ? renderSettingsMode() : (
        <div className="config-panel__content">
          <section className={`status-card status-card--${statusTone}`}>
            <span className="status-card__title">{statusTitle}</span>
            <span className="status-card__text">{statusText}</span>
          </section>

          {DetailComp && selectedEntity && (
            <section className="inspector-card">
              <div className="inspector-card__title">Plugin Detail</div>
              <PluginErrorBoundary pluginId={selectedEntity.pluginId}>
                {/* eslint-disable-next-line react-hooks/static-components */}
                <DetailComp entity={selectedEntity} />
              </PluginErrorBoundary>
            </section>
          )}

          {SidebarComp && managed && (
            <section className="inspector-card">
              <div className="inspector-card__title">Plugin Panel</div>
              <PluginErrorBoundary pluginId={managed.plugin.id}>
                {/* eslint-disable-next-line react-hooks/static-components */}
                <SidebarComp plugin={managed.plugin} />
              </PluginErrorBoundary>
            </section>
          )}

          {managed?.plugin.description && (
            <section className="inspector-card">
              <div className="inspector-card__title">Feed</div>
              <p>{managed.plugin.description}</p>
            </section>
          )}

          {pluginId && legend.length > 0 && !selectedEntity && (
            <section className="inspector-card feed-legend-card">
              <div className="feed-legend-card__header">
                <div className="inspector-card__title">Data Point Colors</div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    className="feed-legend-card__clear"
                    onClick={() => {
                        clearFilters(pluginId);
                        trackEvent("filter-clear", { plugin: pluginId, surface: "inspector-legend" });
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="feed-legend-list">
                {legend.map((item) => {
                    const activeLegendFilter = item.filterId ? activePluginFilters[item.filterId] : undefined;
                    const filterActive = Boolean(item.filterValue
                        && activeLegendFilter?.type === "select"
                        && activeLegendFilter.values.includes(item.filterValue));
                    return (
                      <button
                        key={`${item.label}-${item.color}`}
                        type="button"
                        className={`feed-legend-row ${filterActive ? "feed-legend-row--active" : ""}`}
                        onClick={() => {
                            if (!item.filterId || !item.filterValue) return;
                            setFilter(pluginId, item.filterId, { type: "select", values: [item.filterValue] });
                            trackEvent("filter-change", { plugin: pluginId, filter: item.filterId, surface: "inspector-legend" });
                        }}
                      >
                        <span className="feed-legend-row__bar" style={{ background: item.color }} />
                        <span className="feed-legend-row__dot" style={{ background: item.color }} />
                        <span className="feed-legend-row__text">
                          <span>{item.label}</span>
                          <span>{item.color.toUpperCase()}</span>
                        </span>
                        {item.filterId && (
                          <span className="feed-legend-row__filter" title={`Filter to ${item.label}`}>
                            <Funnel size={13} />
                          </span>
                        )}
                      </button>
                    );
                })}
              </div>
            </section>
          )}

          {pluginId && sourceHealth && (
            <section className={`status-card status-card--${toneForFeedState(focusedRuntimeState)}`}>
              <span className="status-card__title">Source</span>
              <span className="status-card__text">
                {(sourceHealth.sourceName ?? managed?.plugin.name ?? pluginId)}
                {" · "}
                {labelForFeedState(focusedRuntimeState)}
                {typeof sourceHealth.itemCount === "number" ? ` · ${sourceHealth.itemCount.toLocaleString()} items` : ""}
                {typeof sourceHealth.latencyMs === "number" ? ` · ${sourceHealth.latencyMs} ms` : ""}
                {sourceHealth.lastSuccessAt ? ` · updated ${new Date(sourceHealth.lastSuccessAt).toLocaleTimeString()}` : ""}
                {sourceHealth.lastErrorMessage ? ` · ${sourceHealth.lastErrorMessage}` : ""}
              </span>
            </section>
          )}

          {weatherMeta && !selectedEntity && (
            <section className="inspector-card weather-overlay-card">
              <div className="inspector-card__title">Weather Overlay</div>
              <div className="weather-overlay-card__meta">
                <div className="weather-overlay-card__row">
                  <span>Provider</span>
                  <span>{weatherMeta.providerLabel}</span>
                </div>
                <div className="weather-overlay-card__row">
                  <span>Layer type</span>
                  <span>{weatherMeta.description}</span>
                </div>
                <div className="weather-overlay-card__row">
                  <span>Opacity</span>
                  <span>{Math.round(weatherMeta.opacity * 100)}%</span>
                </div>
                <div className="weather-overlay-card__row">
                  <span>Source</span>
                  <span>{WEATHER_TILE_URL_TEMPLATE}</span>
                </div>
                <div className="weather-overlay-card__row">
                  <span>Freshness</span>
                  <span>{weatherMeta.freshnessLabel}</span>
                </div>
              </div>
              <div className="weather-overlay-card__legend">
                {weatherMeta.legend.map((item) => (
                  <div key={item.label} className="weather-overlay-card__legend-item">
                    <span className="weather-overlay-card__swatch" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <table className="kv-table">
            <tbody>
              {rows.map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedProps.length > 0 && (
            <section className="inspector-properties">
              <div className="inspector-card__title">Properties</div>
              <table className="kv-table">
                <tbody>
                  {selectedProps.map(([key, value]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{formatValue(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
        )}
      </aside>
    );
}
