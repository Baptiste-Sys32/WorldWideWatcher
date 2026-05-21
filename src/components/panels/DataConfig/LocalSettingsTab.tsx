/**
 * @file LocalSettingsTab.tsx
 * @module Panels/DataConfig
 * @description Local-first settings surface for imports, diagnostics, and status.
 */

import { ImportPanel } from "@/plugins/geojson/ImportPanel";
import { useStore } from "@/core/state/store";
import { pluginManager } from "@/core/plugins/PluginManager";
import { PluginErrorBoundary } from "@/components/common/PluginErrorBoundary";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { GraphicsSettings } from "../GraphicsSettings";
import { OverlayTab } from "./OverlayTab";
import { PluginsTab } from "../PluginsTab";
import "@/plugins/geojson/geojson-importer.css";

function StatusCard({
    tone,
    title,
    children,
}: {
    tone: "ok" | "warn" | "bad" | "info";
    title: string;
    children: ReactNode;
}) {
    return (
      <section className={`local-settings-card local-settings-card--${tone}`}>
        <div className="local-settings-card__title">{title}</div>
        <div className="local-settings-card__body">{children}</div>
      </section>
    );
}

export function LocalSettingsTab() {
    const layers = useStore((s) => s.layers);
    const entitiesByPlugin = useStore((s) => s.entitiesByPlugin);
    const fps = useStore((s) => s.fps);
    const cameraAlt = useStore((s) => s.cameraAlt);
    const aviationCount = entitiesByPlugin.aviation?.length ?? layers.aviation?.entityCount ?? 0;
    const liveCount = Object.values(layers).filter((layer) => layer.enabled && (layer.entityCount ?? 0) > 0).length;
    const [engine, setEngine] = useState<{ status: "checking" | "online" | "offline"; count: number; error?: string }>({
        status: "checking",
        count: 0,
    });

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 800);

        fetch(`${window.location.protocol}//${window.location.hostname}:5000/manifest`, {
            signal: controller.signal,
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) {
                    setEngine({ status: "online", count: Array.isArray(data.plugins) ? data.plugins.length : 0 });
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setEngine({ status: "offline", count: 0, error: err instanceof Error ? err.message : String(err) });
                }
            })
            .finally(() => window.clearTimeout(timeout));

        return () => {
            cancelled = true;
            controller.abort();
            window.clearTimeout(timeout);
        };
    }, []);

    const configurablePlugins = pluginManager
        .getAllPlugins()
        .filter((managed) => managed.plugin.getSettingsComponent);

    return (
      <div className="local-settings">
        <section>
          <div className="local-settings__section-title">Map Render</div>
          <GraphicsSettings />
          <StatusCard tone="info" title="Render Diagnostics">
            {fps}
            {" FPS · Altitude "}
            {cameraAlt > 10000 ? `${(cameraAlt / 1000).toFixed(2)} km` : `${cameraAlt.toFixed(0)} m`}
          </StatusCard>
        </section>

        <section>
          <div className="local-settings__section-title">Local Import</div>
          <ImportPanel />
        </section>

        <section>
          <div className="local-settings__section-title">Diagnostics</div>
          <StatusCard tone={engine.status === "online" ? "ok" : engine.status === "checking" ? "info" : "bad"} title="Local Engine">
            {engine.status === "online"
                ? `Connected on localhost:5000 with ${engine.count.toLocaleString()} local seeders.`
                : engine.status === "checking"
                    ? "Checking localhost:5000 manifest..."
                    : `Offline or blocked. Remote fallback remains active.${engine.error ? ` (${engine.error})` : ""}`}
          </StatusCard>
          <StatusCard tone={aviationCount > 0 ? "ok" : "warn"} title="Civil Aviation">
            {aviationCount > 0
                ? `${aviationCount.toLocaleString()} aviation entities are currently loaded.`
                : "No aviation entities are loaded. Keep this explicit instead of showing a silent spinner."}
          </StatusCard>
          <StatusCard tone="ok" title="Live Streams">
            {liveCount.toLocaleString()}
            {" "}
            enabled layers currently have loaded entities.
          </StatusCard>
          <StatusCard tone="info" title="Offline Mode">
            Imports, cached data, and status checks stay available for this local copy.
          </StatusCard>
        </section>

        <section>
          <div className="local-settings__section-title">Layer Config</div>
          <OverlayTab />
        </section>

        {configurablePlugins.length > 0 && (
          <section>
            <div className="local-settings__section-title">Plugin Settings</div>
            {configurablePlugins.map((managed) => {
                const SettingsComp = managed.plugin.getSettingsComponent?.();
                if (!SettingsComp) return null;
                return (
                  <div key={managed.plugin.id} className="local-settings-card local-settings-card--info">
                    <div className="local-settings-card__title">{managed.plugin.name}</div>
                    <div className="local-settings-card__body">
                      <PluginErrorBoundary pluginId={managed.plugin.id}>
                        <SettingsComp pluginId={managed.plugin.id} />
                      </PluginErrorBoundary>
                    </div>
                  </div>
                );
            })}
          </section>
        )}

        <section>
          <div className="local-settings__section-title">Plugin Management</div>
          <PluginsTab showMarketplaceActions />
        </section>
      </div>
    );
}
