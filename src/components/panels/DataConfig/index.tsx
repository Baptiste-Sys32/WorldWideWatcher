"use client";

/**
 * @file index.tsx
 * @module Panels/DataConfig
 * @description Right-side inspector panel for the OLED shell.
 */

import {
    ChevronRight,
    Clock,
    Globe2,
} from "lucide-react";

import { PluginIcon } from "@/components/common/PluginIcon";
import { PluginErrorBoundary } from "@/components/common/PluginErrorBoundary";
import { FilterSection } from "@/components/panels/FilterPanel";
import { dataBus } from "@/core/data/DataBus";
import { useIsMobile } from "@/core/hooks/useIsMobile";
import { useResizablePanel } from "@/core/hooks/useResizablePanel";
import { pluginManager } from "@/core/plugins/PluginManager";
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
        const interval = managed.plugin.getPollingInterval();
        if (interval <= 0) return "Push / manual";
        return `${Math.round(interval / 1000)}s`;
    } catch {
        return "Unknown";
    }
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
    const weatherMeta = pluginId ? WEATHER_LAYER_META_BY_ID[pluginId as WeatherLayerId] : undefined;

    const selectedProps = selectedEntity
        ? Object.entries(selectedEntity.properties ?? {}).slice(0, 8)
        : [];
    const DetailComp = selectedEntity ? managed?.plugin.getDetailComponent?.() : null;
    const SidebarComp = !selectedEntity ? managed?.plugin.getSidebarComponent?.() : null;

    const statusTone: StatusTone = layer?.loading ? "info" : layer?.enabled ? "ok" : managed ? "warn" : "bad";
    const statusTitle = selectedEntity ? "Entity Selected" : layer?.enabled ? "Layer Live" : managed ? "Layer Idle" : "No Focus";
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

    const title = activeRightOverlay === "map"
        ? "Map"
        : activeRightOverlay === "filters"
            ? "Filters"
            : selectedEntity?.label || selectedEntity?.id || managed?.plugin.name || "Inspector";
    const subtitle = activeRightOverlay === "map"
        ? "region presets"
        : activeRightOverlay === "filters"
            ? "time frame and data filters"
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
            {managed && (
              <span className="inspector-heading__icon">
                <PluginIcon icon={managed.plugin.icon} size={18} />
              </span>
            )}
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

        {activeRightOverlay ? renderOverlay() : (
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

          {pluginId && sourceHealth && (
            <section className={`status-card status-card--${
                sourceHealth.status === "healthy" ? "ok"
                    : sourceHealth.status === "error" ? "bad"
                        : sourceHealth.status === "degraded" || sourceHealth.status === "stale" ? "warn"
                            : "info"
            }`}
            >
              <span className="status-card__title">Source</span>
              <span className="status-card__text">
                {(sourceHealth.sourceName ?? managed?.plugin.name ?? pluginId)}
                {" · "}
                {sourceHealth.status}
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
