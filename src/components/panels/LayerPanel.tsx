"use client";

/**
 * @file LayerPanel.tsx
 * @description Primary left-sidebar workspace for data, imagery, plugins, and local settings.
 * @module src/components/panels
 */

import { useState } from "react";
import {
    ChevronLeft,
    CircuitBoard,
    Globe2,
    Puzzle,
    Search,
    Settings,
} from "lucide-react";

import { useIsMobile } from "@/core/hooks/useIsMobile";
import { useResizablePanel } from "@/core/hooks/useResizablePanel";
import { pluginManager } from "@/core/plugins/PluginManager";
import { useStore } from "@/core/state/store";
import { trackEvent } from "@/lib/analytics";
import { WEATHER_OVERLAY_PLUGIN_IDS, type WeatherOverlayPluginId } from "@/plugins/weather/weatherOverlayPlugins";
import { LocalSettingsTab } from "./DataConfig/LocalSettingsTab";
import { ImageryPicker } from "./ImageryPicker";
import { LayerItem } from "./LayerItem";
import { PluginsTab } from "./PluginsTab";

import "@/plugins/geojson/geojson-importer.css";
import "./LayerPanel.css";

const CATEGORY_LABELS: Record<string, string> = {
    aviation: "Aviation",
    maritime: "Maritime",
    "natural-disaster": "Natural Disasters",
    conflict: "Conflict",
    infrastructure: "Infrastructure",
    space: "Space",
    cyber: "Cyber",
    economic: "Economic",
    weather: "Weather",
    custom: "Custom",
};

const WEATHER_PLUGIN_IDS = new Set<string>(WEATHER_OVERLAY_PLUGIN_IDS);

function isWeatherPluginId(pluginId: string): pluginId is WeatherOverlayPluginId {
    return WEATHER_PLUGIN_IDS.has(pluginId);
}

type LeftPanelTab = "data" | "imagery" | "plugins" | "settings";
type PrimaryPanelTab = Exclude<LeftPanelTab, "settings">;

const PRIMARY_TABS: PrimaryPanelTab[] = ["data", "imagery", "plugins"];
const PANEL_TAB_META: Record<PrimaryPanelTab, { label: string; Icon: typeof CircuitBoard }> = {
    data: { label: "Data", Icon: CircuitBoard },
    imagery: { label: "Imagery", Icon: Globe2 },
    plugins: { label: "Plugins", Icon: Puzzle },
};

export function LayerPanel() {
    const isMobile = useIsMobile();
    const { width, startResizing } = useResizablePanel(390, 320, 680, "left");
    const leftSidebarOpen = useStore((s) => s.leftSidebarOpen);
    const openMobilePanel = useStore((s) => s.openMobilePanel);
    const activeTab = useStore((s) => s.activeLayerPanelTab);
    const setActiveTab = useStore((s) => s.setActiveLayerPanelTab);
    const toggleLeftSidebar = useStore((s) => s.toggleLeftSidebar);
    const setOpenMobilePanel = useStore((s) => s.setOpenMobilePanel);
    const layers = useStore((s) => s.layers);
    const entitiesByPlugin = useStore((s) => s.entitiesByPlugin);
    const highlightLayerId = useStore((s) => s.highlightLayerId);
    const setHighlightLayerId = useStore((s) => s.setHighlightLayerId);
    const setConfigPanelOpen = useStore((s) => s.setConfigPanelOpen);
    const setSelectedEntity = useStore((s) => s.setSelectedEntity);
    const updateMapConfig = useStore((s) => s.updateMapConfig);

    const [searchQuery, setSearchQuery] = useState("");
    const allPlugins = pluginManager.getAllPlugins();
    const query = searchQuery.toLowerCase();

    const grouped: Record<string, typeof allPlugins> = {};
    allPlugins.forEach((managed) => {
        if (
            !query
            || managed.plugin.name.toLowerCase().includes(query)
            || managed.plugin.description?.toLowerCase().includes(query)
            || managed.plugin.id.toLowerCase().includes(query)
        ) {
            const category = managed.plugin.category;
            if (!grouped[category]) grouped[category] = [];
            grouped[category].push(managed);
        }
    });

    const isOpen = isMobile ? openMobilePanel === "left" : leftSidebarOpen;

    const switchTab = (tab: LeftPanelTab) => {
        setActiveTab(tab);
        trackEvent("panel-tab-switch", { tab });
    };

    const cyclePrimaryTab = () => {
        const current = PRIMARY_TABS.includes(activeTab as PrimaryPanelTab) ? activeTab as PrimaryPanelTab : "data";
        const next = PRIMARY_TABS[(PRIMARY_TABS.indexOf(current) + 1) % PRIMARY_TABS.length];
        switchTab(next);
    };

    const closePanel = () => {
        if (isMobile) setOpenMobilePanel("left");
        else toggleLeftSidebar();
        trackEvent("panel-toggle", { panel: "left", open: false });
    };

    const handleToggle = (pluginId: string) => {
        const isEnabled = layers[pluginId]?.enabled;
        if (isEnabled) {
            pluginManager.disablePlugin(pluginId);
            useStore.getState().setLayerEnabled(pluginId, false);
            useStore.getState().clearEntities(pluginId);
            useStore.getState().setEntityCount(pluginId, 0);

            const state = useStore.getState();
            if (state.hoveredEntity?.pluginId === pluginId) {
                state.setHoveredEntity(null, null);
            }
            if (state.selectedEntity?.pluginId === pluginId) {
                state.setSelectedEntity(null);
            }
            if (isWeatherPluginId(pluginId)) {
                updateMapConfig({ weatherOverlay: null });
            }
        } else {
            if (isWeatherPluginId(pluginId)) {
                for (const weatherPluginId of WEATHER_OVERLAY_PLUGIN_IDS) {
                    if (weatherPluginId === pluginId) continue;
                    pluginManager.disablePlugin(weatherPluginId);
                    useStore.getState().setLayerEnabled(weatherPluginId, false);
                    useStore.getState().clearEntities(weatherPluginId);
                    useStore.getState().setEntityCount(weatherPluginId, 0);
                }
                updateMapConfig({ weatherOverlay: pluginId });
            }
            pluginManager.enablePlugin(pluginId);
            useStore.getState().setLayerEnabled(pluginId, true);
            useStore.getState().setHighlightLayerId(pluginId);
            useStore.getState().setSelectedEntity(null);
            useStore.getState().setConfigPanelOpen(true);
        }
        trackEvent("layer-toggle", { layer: pluginId, enabled: !isEnabled });
    };

    return (
      <aside
        className={`sidebar sidebar--left glass-panel ${isMobile ? "sidebar--mobile" : ""} ${isOpen ? "" : "sidebar--closed"}`}
        style={{ width: isMobile ? undefined : width }}
      >
        {!isMobile && (
          <div
            className="resize-handle resize-handle--left"
            onMouseDown={startResizing}
            title="Resize data panel"
          />
        )}

        <div className="panel-header">
          {activeTab === "settings" ? (
            <div className="settings-panel-title">
              <Settings size={15} />
              <span>Settings</span>
            </div>
          ) : (
            <>
              <span className="sr-only">Data workspace</span>
              <div className="panel-mode-cycler" aria-label="Layer panel mode">
                <button
                  type="button"
                  className="panel-mode-button"
                  onClick={cyclePrimaryTab}
                  title={`Current: ${PANEL_TAB_META[activeTab as PrimaryPanelTab]?.label ?? "Data"}. Click to cycle panel mode.`}
                  aria-label={`Current panel mode: ${PANEL_TAB_META[activeTab as PrimaryPanelTab]?.label ?? "Data"}. Click to cycle.`}
                >
                  {(() => {
                      const { Icon } = PANEL_TAB_META[activeTab as PrimaryPanelTab] ?? PANEL_TAB_META.data;
                      return <Icon size={15} />;
                  })()}
                </button>
                <div className="panel-mode-dots" aria-hidden="true">
                  {PRIMARY_TABS.map((tab) => (
                    <span key={tab} className={`panel-mode-dot ${activeTab === tab ? "panel-mode-dot--active" : ""}`} />
                  ))}
                </div>
              </div>
            </>
          )}
          <button
            type="button"
            className="collapse-btn"
            onClick={closePanel}
            title="Hide data panel"
            aria-label="Hide data panel"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {activeTab === "data" && (
          <div className="layers-tab-content">
            <div className="layers-tab-search-wrapper">
              <div className="layers-tab-search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filter feeds..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="layers-tab-content__list">
              {Object.keys(grouped).length === 0 && (
                <div className="layers-tab-empty">
                  {query ? "No feeds match this filter." : "No feeds are available."}
                </div>
              )}
              {Object.entries(grouped).map(([category, plugins]) => (
                <section key={category}>
                  <div className="layer-category-title">{CATEGORY_LABELS[category] || category}</div>
                  {plugins.map((managed) => {
                      const isEnabled = layers[managed.plugin.id]?.enabled || false;
                      const isLoading = layers[managed.plugin.id]?.loading || false;
                      const count = (entitiesByPlugin[managed.plugin.id] || []).length;

                      return (
                        <LayerItem
                          key={managed.plugin.id}
                          plugin={managed.plugin}
                          isEnabled={isEnabled}
                          isLoading={isLoading}
                          entityCount={count}
                          isSelected={highlightLayerId === managed.plugin.id}
                          onToggle={() => handleToggle(managed.plugin.id)}
                          onSelect={() => {
                              const newId = highlightLayerId === managed.plugin.id ? null : managed.plugin.id;
                              setHighlightLayerId(newId);
                              if (newId) {
                                  setSelectedEntity(null);
                                  setConfigPanelOpen(true);
                              }
                          }}
                        />
                      );
                  })}
                </section>
              ))}
            </div>
          </div>
        )}

        {activeTab === "imagery" && <ImageryPicker />}
        {activeTab === "plugins" && <PluginsTab />}
        {activeTab === "settings" && (
          <div className="local-settings-shell">
            <LocalSettingsTab />
          </div>
        )}
      </aside>
    );
}
