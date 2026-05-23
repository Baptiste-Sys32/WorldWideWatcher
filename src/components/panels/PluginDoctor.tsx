"use client";

import { useMemo, useState } from "react";
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Play,
    RefreshCw,
    SearchCheck,
    XCircle,
} from "lucide-react";
import { PluginIcon } from "@/components/common/PluginIcon";
import { pluginManager } from "@/core/plugins/PluginManager";
import { getPluginAliases } from "@/core/plugins/pluginIds";
import { resolvePluginMetadata } from "@/core/plugins/pluginMetadata";
import type { GeoEntity } from "@/core/plugins/PluginTypes";
import { useStore } from "@/core/state/store";
import "./PluginDoctor.css";

type CheckTone = "ok" | "warn" | "bad" | "info";

interface DoctorResult {
    tone: CheckTone;
    summary: string;
    details: string[];
    checkedAt: number;
}

function toneForStatus(status?: string): CheckTone {
    if (status === "healthy") return "ok";
    if (status === "error") return "bad";
    if (status === "degraded" || status === "stale") return "warn";
    return "info";
}

function validateEntities(pluginId: string, entities: GeoEntity[]): string[] {
    const issues: string[] = [];
    for (const entity of entities.slice(0, 25)) {
        if (!entity.id) issues.push("entity missing id");
        if (entity.pluginId !== pluginId) issues.push(`entity ${entity.id || "(unknown)"} has pluginId ${entity.pluginId}`);
        if (typeof entity.latitude !== "number" || !Number.isFinite(entity.latitude)) issues.push(`entity ${entity.id} has invalid latitude`);
        if (typeof entity.longitude !== "number" || !Number.isFinite(entity.longitude)) issues.push(`entity ${entity.id} has invalid longitude`);
        const timestamp = entity.timestamp instanceof Date ? entity.timestamp : new Date(String(entity.timestamp));
        if (Number.isNaN(timestamp.getTime())) issues.push(`entity ${entity.id} has invalid timestamp`);
    }
    return Array.from(new Set(issues));
}

function safeProbeUrl(url?: string): string | null {
    if (!url) return null;
    if (url.startsWith("/")) return url;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" ? parsed.toString() : null;
    } catch {
        return null;
    }
}

export function PluginDoctor() {
    const layers = useStore((s) => s.layers);
    const entitiesByPlugin = useStore((s) => s.entitiesByPlugin);
    const sourceHealthByPlugin = useStore((s) => s.sourceHealthByPlugin);
    const setHighlightLayerId = useStore((s) => s.setHighlightLayerId);
    const setActiveLayerPanelTab = useStore((s) => s.setActiveLayerPanelTab);
    const [results, setResults] = useState<Record<string, DoctorResult>>({});
    const [running, setRunning] = useState<Record<string, boolean>>({});

    const aliases = useMemo(() => getPluginAliases(), []);
    const managedPlugins = pluginManager.getAllPlugins();

    const runCheck = async (pluginId: string) => {
        const managed = pluginManager.getPlugin(pluginId);
        const metadata = resolvePluginMetadata(pluginId);
        const entities = entitiesByPlugin[pluginId] ?? [];
        const health = sourceHealthByPlugin[pluginId];
        const details: string[] = [];
        let tone: CheckTone = toneForStatus(health?.status);

        setRunning((prev) => ({ ...prev, [pluginId]: true }));
        try {
            if (!managed) {
                tone = "bad";
                details.push("Plugin is not registered with PluginManager.");
            }
            if (!metadata) {
                tone = "bad";
                details.push("Plugin metadata could not be resolved.");
            } else {
                details.push(`Trust: ${metadata.trust}`);
                details.push(`Category: ${metadata.category}`);
            }
            if (aliases[pluginId]) details.push(`Engine alias: ${aliases[pluginId]}`);
            if (health?.lastErrorMessage) details.push(`Last error: ${health.lastErrorMessage}`);
            if (health?.lastSuccessAt) details.push(`Last success: ${new Date(health.lastSuccessAt).toLocaleString()}`);

            const entityIssues = validateEntities(pluginId, entities);
            if (entityIssues.length > 0) {
                tone = tone === "bad" ? "bad" : "warn";
                details.push(...entityIssues.slice(0, 5));
            } else if (entities.length > 0) {
                details.push(`${entities.length.toLocaleString()} entities passed shape checks.`);
            } else {
                details.push("No loaded entities to validate.");
            }

            const probeUrl = safeProbeUrl(health?.sourceUrl ?? managed?.plugin.getServerConfig?.()?.sourceUrl);
            if (probeUrl) {
                const probe = probeUrl.startsWith("/")
                    ? await fetch(probeUrl).then(async (res) => ({
                        ok: res.ok,
                        status: res.status,
                        shape: "local route",
                    })).catch((err) => ({ ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }))
                    : await fetch("/api/plugins/doctor", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: probeUrl }),
                    }).then((res) => res.json());
                details.push(`Probe: ${probe.ok ? "ok" : "failed"}${probe.status ? ` HTTP ${probe.status}` : ""}${probe.shape ? ` (${probe.shape})` : ""}`);
                if (!probe.ok) tone = tone === "bad" ? "bad" : "warn";
            }

            setResults((prev) => ({
                ...prev,
                [pluginId]: {
                    tone,
                    summary: tone === "ok" ? "Healthy" : tone === "warn" ? "Needs attention" : tone === "bad" ? "Failing" : "No live data yet",
                    details,
                    checkedAt: Date.now(),
                },
            }));
        } finally {
            setRunning((prev) => ({ ...prev, [pluginId]: false }));
        }
    };

    const runAll = () => {
        for (const managed of managedPlugins) {
            void runCheck(managed.plugin.id);
        }
    };

    return (
      <section className="plugin-doctor">
        <div className="plugin-doctor__header">
          <div>
            <div className="plugin-doctor__title">
              <SearchCheck size={16} />
              Plugin Doctor
            </div>
            <p>Checks registration, source health, ID aliases, probes, and loaded entity shape.</p>
          </div>
          <button type="button" className="plugin-doctor__run-all" onClick={runAll}>
            <RefreshCw size={14} />
            Run All
          </button>
        </div>

        <div className="plugin-doctor__list">
          {managedPlugins.map(({ plugin }) => {
              const layer = layers[plugin.id];
              const health = sourceHealthByPlugin[plugin.id];
              const result = results[plugin.id];
              const tone = result?.tone ?? toneForStatus(health?.status);
              const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? XCircle : tone === "warn" ? AlertTriangle : Activity;
              return (
                <article key={plugin.id} className={`plugin-doctor-row plugin-doctor-row--${tone}`}>
                  <div className="plugin-doctor-row__icon">
                    <PluginIcon icon={plugin.icon} size={18} />
                  </div>
                  <div className="plugin-doctor-row__main">
                    <div className="plugin-doctor-row__top">
                      <span>{plugin.name}</span>
                      <span>{layer?.enabled ? "Enabled" : "Disabled"}</span>
                    </div>
                    <div className="plugin-doctor-row__meta">
                      <Icon size={13} />
                      <span>{result?.summary ?? health?.status ?? "Not checked"}</span>
                      <span>{(entitiesByPlugin[plugin.id]?.length ?? 0).toLocaleString()} entities</span>
                      {health?.sourceName && <span>{health.sourceName}</span>}
                    </div>
                    {result && (
                      <ul className="plugin-doctor-row__details">
                        {result.details.map((detail) => <li key={detail}>{detail}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="plugin-doctor-row__actions">
                    <button
                      type="button"
                      onClick={() => {
                          setHighlightLayerId(plugin.id);
                          setActiveLayerPanelTab("data");
                      }}
                      title="Focus layer"
                    >
                      Focus
                    </button>
                    <button type="button" onClick={() => runCheck(plugin.id)} disabled={running[plugin.id]}>
                      <Play size={12} />
                      {running[plugin.id] ? "Checking" : "Check"}
                    </button>
                  </div>
                </article>
              );
          })}
        </div>
      </section>
    );
}
