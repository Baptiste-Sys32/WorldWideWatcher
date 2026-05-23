"use client";

/**
 * @file Header.tsx
 * @description Local-first application header for the OLED shell.
 * @module src/components/layout
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    Layers,
    Map,
    Monitor,
    Moon,
    Settings as SettingsIcon,
    SlidersHorizontal,
    Sun,
} from "lucide-react";

import { DEMO_ADMIN_ROLE, isDemo } from "@/core/edition";
import { useIsMobile } from "@/core/hooks/useIsMobile";
import { pluginManager } from "@/core/plugins/PluginManager";
import { useStore } from "@/core/state/store";
import { trackEvent } from "@/lib/analytics";
import { SearchBar } from "./SearchBar";

import "./timeSelect.css";

const THEMES = [
    { id: "black", label: "Black", icon: Moon },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "light", label: "Light", icon: Sun },
    { id: "legacy", label: "Legacy", icon: Monitor },
] as const;

export function Header() {
    const isMobile = useIsMobile();
    const theme = useStore((s) => s.theme);
    const setTheme = useStore((s) => s.setTheme);
    const activeLayerPanelTab = useStore((s) => s.activeLayerPanelTab);
    const setActiveLayerPanelTab = useStore((s) => s.setActiveLayerPanelTab);
    const leftSidebarOpen = useStore((s) => s.leftSidebarOpen);
    const toggleLeftSidebar = useStore((s) => s.toggleLeftSidebar);
    const activeRightOverlay = useStore((s) => s.activeRightOverlay);
    const setActiveRightOverlay = useStore((s) => s.setActiveRightOverlay);
    const openMobilePanel = useStore((s) => s.openMobilePanel);
    const setOpenMobilePanel = useStore((s) => s.setOpenMobilePanel);
    const layers = useStore((s) => s.layers);
    const sourceHealthByPlugin = useStore((s) => s.sourceHealthByPlugin);

    const [isDemoAdmin, setIsDemoAdmin] = useState(false);
    const [themeOpen, setThemeOpen] = useState(false);
    const [layersPopoverOpen, setLayersPopoverOpen] = useState(false);
    const previousLeftTabRef = useRef<"data" | "imagery" | "plugins">("data");
    const themeButtonRef = useRef<HTMLButtonElement>(null);
    const layerHoldTimerRef = useRef<number | null>(null);
    const [themePos, setThemePos] = useState({ top: 0, right: 0 });
    const layerStatus = useMemo(() => {
        const enabledIds = Object.entries(layers)
            .filter(([, layer]) => layer.enabled)
            .map(([pluginId]) => pluginId);
        const problemIds = enabledIds.filter((pluginId) => {
            const status = sourceHealthByPlugin[pluginId]?.status;
            return status === "degraded" || status === "error" || status === "stale";
        });
        const problemNames = problemIds.map((pluginId) => pluginManager.getPlugin(pluginId)?.plugin.name ?? pluginId);
        return { enabledCount: enabledIds.length, problemCount: problemIds.length, problemNames };
    }, [layers, sourceHealthByPlugin]);
    const enabledLayerItems = useMemo(() => Object.entries(layers)
        .filter(([, layer]) => layer.enabled)
        .map(([pluginId, layer]) => ({
            pluginId,
            layer,
            name: pluginManager.getPlugin(pluginId)?.plugin.name ?? pluginId,
            status: sourceHealthByPlugin[pluginId]?.status ?? "idle",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)), [layers, sourceHealthByPlugin]);
    const layerHealthTitle = `${layerStatus.enabledCount} enabled layer${layerStatus.enabledCount === 1 ? "" : "s"}${layerStatus.problemNames.length > 0 ? `; needs attention: ${layerStatus.problemNames.join(", ")}` : ""}`;

    useEffect(() => {
        if (!isDemo) return;
        fetch("/api/auth/session")
            .then((r) => r.json())
            .then((s) => setIsDemoAdmin(s?.user?.role === DEMO_ADMIN_ROLE))
            .catch(() => {});
    }, []);

    const openLeftTab = (tab: "data" | "imagery" | "plugins" | "settings") => {
        setActiveLayerPanelTab(tab);
        if (isMobile && openMobilePanel !== "left") setOpenMobilePanel("left");
    };

    const focusLayerSearch = () => {
        window.setTimeout(() => {
            document.querySelector<HTMLInputElement>(".layers-tab-search input")?.focus();
        }, 0);
    };

    const toggleLayersPanel = () => {
        const isLayersOpen = activeLayerPanelTab === "data" && (isMobile ? openMobilePanel === "left" : leftSidebarOpen);
        if (isLayersOpen) {
            if (isMobile) setOpenMobilePanel("left");
            else toggleLeftSidebar();
            trackEvent("panel-toggle", { panel: "left", open: false, tab: "data" });
            return;
        }

        openLeftTab("data");
        focusLayerSearch();
        trackEvent("panel-tab-switch", { tab: "data" });
    };

    const toggleLayerFromPopover = (pluginId: string, enabled: boolean) => {
        const state = useStore.getState();
        if (enabled) {
            pluginManager.disablePlugin(pluginId);
            state.setLayerEnabled(pluginId, false);
            state.clearEntities(pluginId);
            state.setEntityCount(pluginId, 0);
        } else {
            void pluginManager.enablePlugin(pluginId);
            state.setLayerEnabled(pluginId, true);
        }
        state.setHighlightLayerId(pluginId);
    };

    const startLayerHold = () => {
        if (layerHoldTimerRef.current !== null) window.clearTimeout(layerHoldTimerRef.current);
        layerHoldTimerRef.current = window.setTimeout(() => setLayersPopoverOpen(true), 450);
    };

    const clearLayerHold = () => {
        if (layerHoldTimerRef.current !== null) {
            window.clearTimeout(layerHoldTimerRef.current);
            layerHoldTimerRef.current = null;
        }
    };

    const toggleSettings = () => {
        if (activeLayerPanelTab === "settings") {
            openLeftTab(previousLeftTabRef.current);
            return;
        }

        previousLeftTabRef.current = activeLayerPanelTab;
        openLeftTab("settings");
        trackEvent("panel-tab-switch", { tab: "settings" });
    };

    const toggleRightOverlay = (panel: "map" | "filters") => {
        setActiveRightOverlay(activeRightOverlay === panel ? null : panel);
        trackEvent("header-overlay-toggle", { panel, open: activeRightOverlay !== panel });
    };

    const openThemeMenu = () => {
        if (!themeOpen && themeButtonRef.current) {
            const rect = themeButtonRef.current.getBoundingClientRect();
            setThemePos({
                top: rect.bottom + 8,
                right: window.innerWidth - (rect.right + 2),
            });
        }
        setThemeOpen((v) => !v);
    };

    return (
      <>
        <header className={`header glass-panel ${isMobile ? "header--mobile" : ""}`}>
          <div className="header__brand">
            <Link href="/" className="header__brand-link">
              <div className="header__brand-row">
                <Image src="/logo/logo-icon.svg" alt="WorldWideWatcher" width={24} height={24} />
                <div className="header__logo">{isMobile ? "WWW" : "WorldWideWatcher"}</div>
                {isDemoAdmin && <span className="alpha-badge alpha-badge--admin">ADMIN</span>}
              </div>
            </Link>

            <div className="header__search-container">
              <SearchBar />
            </div>
          </div>

          <div className="header__controls">
            {!isMobile && (
              <div className="header__controls-scroll">
                <button
                  type="button"
                  className={`btn btn--flat ${activeRightOverlay === "map" ? "btn--active" : ""}`}
                  onClick={() => toggleRightOverlay("map")}
                  title="Map presets"
                >
                  <Map size={14} />
                  <span>Map</span>
                </button>
                <div
                  className="header-layer-popover-anchor"
                  onMouseEnter={() => setLayersPopoverOpen(true)}
                  onMouseLeave={() => { clearLayerHold(); setLayersPopoverOpen(false); }}
                  onFocus={() => setLayersPopoverOpen(true)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setLayersPopoverOpen(false);
                  }}
                >
                  <button
                    type="button"
                    className={`btn btn--flat header-layer-btn ${activeLayerPanelTab === "data" && leftSidebarOpen ? "btn--active" : ""}`}
                    onClick={toggleLayersPanel}
                    onPointerDown={startLayerHold}
                    onPointerUp={clearLayerHold}
                    onPointerCancel={clearLayerHold}
                    title={`${activeLayerPanelTab === "data" && leftSidebarOpen ? "Hide" : "Open"} data layers`}
                  >
                    <Layers size={14} />
                    <span>Layers</span>
                    {layerStatus.enabledCount > 0 && (
                      <span
                        className={`header-layer-btn__badge ${layerStatus.problemCount > 0 ? "header-layer-btn__badge--warn" : ""}`}
                        title={layerHealthTitle}
                      >
                        {layerStatus.problemCount > 0 ? `${layerStatus.enabledCount}/${layerStatus.problemCount}` : layerStatus.enabledCount}
                      </span>
                    )}
                  </button>
                  {layersPopoverOpen && (
                    <div className="header-layer-popover" role="menu" aria-label="Enabled layers">
                      <div className="header-layer-popover__title">Enabled layers</div>
                      {enabledLayerItems.length === 0 ? (
                        <div className="header-layer-popover__empty">No active layers</div>
                      ) : enabledLayerItems.slice(0, 8).map((item) => {
                        const isProblem = item.status === "degraded" || item.status === "error" || item.status === "stale";
                        return (
                          <button
                            key={item.pluginId}
                            type="button"
                            className="header-layer-popover__item"
                            onClick={() => toggleLayerFromPopover(item.pluginId, item.layer.enabled)}
                            role="menuitemcheckbox"
                            aria-checked={item.layer.enabled}
                          >
                            <span className={`header-layer-popover__dot ${isProblem ? "header-layer-popover__dot--warn" : ""}`} />
                            <span className="header-layer-popover__name">{item.name}</span>
                            <span className="header-layer-popover__toggle">On</span>
                          </button>
                        );
                      })}
                      {enabledLayerItems.length > 8 && (
                        <div className="header-layer-popover__more">
                          +
                          {enabledLayerItems.length - 8}
                          {' '}
                          more
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`btn btn--flat ${activeRightOverlay === "filters" ? "btn--active" : ""}`}
                  onClick={() => toggleRightOverlay("filters")}
                  title="Filters and time frame"
                >
                  <SlidersHorizontal size={14} />
                  <span>Filters</span>
                </button>
              </div>
            )}

            <div className="header-divider" />

            <button
              type="button"
              className={`btn btn--flat ${activeLayerPanelTab === "settings" ? "btn--active" : ""}`}
              onClick={toggleSettings}
              title="Local settings"
            >
              <SettingsIcon size={14} />
              {!isMobile && <span>Settings</span>}
            </button>

            <button
              ref={themeButtonRef}
              type="button"
              className="btn btn--flat btn--icon"
              onClick={openThemeMenu}
              title="Theme"
            >
              {theme === "light" ? <Sun size={14} /> : theme === "legacy" ? <Monitor size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </header>

        {themeOpen && (
          <div className="dropdown-menu" style={{ top: themePos.top, right: themePos.right - 2 }}>
            {THEMES.map((th) => {
                const Icon = th.icon;
                return (
                  <button
                    type="button"
                    key={th.id}
                    className={`dropdown-option ${th.id === theme ? "active" : ""}`}
                    onClick={() => {
                        setTheme(th.id);
                        setThemeOpen(false);
                    }}
                  >
                    <Icon size={14} />
                    {th.label}
                  </button>
                );
            })}
          </div>
        )}
      </>
    );
}
