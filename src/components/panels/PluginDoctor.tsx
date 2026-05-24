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
import {
    getFeedRuntimeState,
    labelForFeedState,
    toneForFeedState,
} from "@/core/diagnostics/feedHealth";
import { pluginManager } from "@/core/plugins/PluginManager";
import { getPluginAliases } from "@/core/plugins/pluginIds";
import { resolvePluginMetadata } from "@/core/plugins/pluginMetadata";
import type { GeoEntity } from "@/core/plugins/PluginTypes";
import { useStore } from "@/core/state/store";
import "./PluginDoctor.css";

type CheckTone = "ok" | "warn" | "bad" | "info";

interface DoctorSection {
    title: string;
    items: string[];
}

interface DoctorResult {
    tone: CheckTone;
    summary: string;
    sections: DoctorSection[];
    checkedAt: number;
}

/**
 * Maps source health statuses to UI tones.
 *
 * @param status - Health status value from the store.
 * @returns Visual tone used by the doctor UI.
 */
function toneForStatus(status?: string): CheckTone {
    if (status === "healthy") return toneForFeedState("healthy");
    if (status === "error") return toneForFeedState("error");
    if (status === "degraded" || status === "stale") return toneForFeedState("degraded");
    if (status === "idle") return toneForFeedState("idle");
    return "info";
}

/**
 * Validates a sample of entity shapes for a plugin.
 *
 * @param pluginId - Plugin identifier to check.
 * @param entities - Entities to validate.
 * @returns Validation issues and count of validated entities.
 */
function validateEntities(pluginId: string, entities: GeoEntity[]): { checked: number; issues: string[] } {
    const issues: string[] = [];
    const sample = entities.slice(0, 25);
    for (const entity of sample) {
        if (!entity.id) issues.push("entity missing id");
        if (entity.pluginId !== pluginId) issues.push(`entity ${entity.id || "(unknown)"} has pluginId ${entity.pluginId}`);
        if (typeof entity.latitude !== "number" || !Number.isFinite(entity.latitude)) issues.push(`entity ${entity.id} has invalid latitude`);
        if (typeof entity.longitude !== "number" || !Number.isFinite(entity.longitude)) issues.push(`entity ${entity.id} has invalid longitude`);
        const timestamp = entity.timestamp instanceof Date ? entity.timestamp : new Date(String(entity.timestamp));
        if (Number.isNaN(timestamp.getTime())) issues.push(`entity ${entity.id} has invalid timestamp`);
    }
    return { checked: sample.length, issues: Array.from(new Set(issues)) };
}

/**
 * Normalizes probe URLs to safe relative or HTTPS endpoints.
 *
 * @param url - URL string to normalize.
 * @returns Sanitized probe URL or null if unsafe.
 */
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

/**
 * Formats a millisecond timestamp into a local date-time string.
 *
 * @param value - Epoch milliseconds.
 * @returns Formatted string or null when missing.
 */
function formatHealthTime(value?: number): string | null {
    if (!value) return null;
    return new Date(value).toLocaleString();
}

/**
 * Runs diagnostics across plugins and shows results in grouped sections.
 *
 * @returns Plugin doctor panel content.
 */
export function PluginDoctor() {
    const layers = useStore((s) => s.layers);
    const entitiesByPlugin = useStore((s) => s.entitiesByPlugin);
    const sourceHealthByPlugin = useStore((s) => s.sourceHealthByPlugin);
    const setHighlightLayerId = useStore((s) => s.setHighlightLayerId);
    const setActiveLayerPanelTab = useStore((s) => s.setActiveLayerPanelTab);
    const [results, setResults] = useState<Record<string, DoctorResult>>({});
    const [running, setRunning] = useState<Record<string, boolean>>({});
    const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});

    const aliases = useMemo(() => getPluginAliases(), []);
    const managedPlugins = pluginManager.getAllPlugins();

    /**
     * Executes a diagnostic check for a single plugin.
     *
     * @param pluginId - Plugin identifier to probe.
     */
    const runCheck = async (pluginId: string) => {
        const managed = pluginManager.getPlugin(pluginId);
        const metadata = resolvePluginMetadata(pluginId);
        const entities = entitiesByPlugin[pluginId] ?? [];
        const health = sourceHealthByPlugin[pluginId];
        const registrationItems: string[] = [];
        const sourceItems: string[] = [];
        const probeItems: string[] = [];
        const entityItems: string[] = [];
        let tone: CheckTone = toneForStatus(health?.status);

        setRunning((prev) => ({ ...prev, [pluginId]: true }));
        try {
            if (!managed) {
                tone = "bad";
                registrationItems.push("PluginManager: missing registration");
            } else {
                registrationItems.push("PluginManager: registered");
            }
            if (!metadata) {
                tone = "bad";
                registrationItems.push("Metadata: missing");
            } else {
                registrationItems.push(`Trust: ${metadata.trust}`);
                registrationItems.push(`Category: ${metadata.category}`);
            }
            if (aliases[pluginId]) registrationItems.push(`Engine alias: ${aliases[pluginId]}`);

            const sourceName = health?.sourceName ?? managed?.plugin.name ?? pluginId;
            const sourceUrl = safeProbeUrl(health?.sourceUrl ?? managed?.plugin.getServerConfig?.()?.sourceUrl);
            sourceItems.push(`Source: ${sourceName}`);
            sourceItems.push(`Status: ${health?.status ?? "unknown"}`);
            sourceItems.push(`URL: ${sourceUrl ?? "Unavailable"}`);
            sourceItems.push(`Last success: ${formatHealthTime(health?.lastSuccessAt) ?? "Never"}`);
            sourceItems.push(`Last error: ${formatHealthTime(health?.lastErrorAt) ?? "None"}`);
            if (health?.lastErrorMessage) {
                sourceItems.push(`Error message: ${health.lastErrorMessage}`);
            }

            const entityCheck = validateEntities(pluginId, entities);
            if (entityCheck.issues.length > 0) {
                tone = tone === "bad" ? "bad" : "warn";
                entityItems.push(`Validated ${entityCheck.checked.toLocaleString()} entities`);
                entityItems.push(`${entityCheck.issues.length} validation issues`);
                entityItems.push(...entityCheck.issues.slice(0, 5));
            } else if (entities.length > 0) {
                entityItems.push(`${entities.length.toLocaleString()} entities loaded`);
                entityItems.push(`Validated ${entityCheck.checked.toLocaleString()} entities (no issues)`);
            } else {
                entityItems.push("No loaded entities to validate.");
            }

            const probeUrl = safeProbeUrl(health?.sourceUrl ?? managed?.plugin.getServerConfig?.()?.sourceUrl);
            if (probeUrl) {
                const probe = probeUrl.startsWith("/")
                    ? await (async () => {
                        const started = performance.now();
                        const res = await fetch(probeUrl);
                        const contentType = res.headers.get("content-type") ?? "";
                        await res.clone().arrayBuffer().catch(() => null);
                        return {
                            ok: res.ok,
                            status: res.status,
                            shape: "local route",
                            contentType,
                            responseMs: Math.round(performance.now() - started),
                        };
                    })().catch((err) => ({
                        ok: false,
                        status: 0,
                        error: err instanceof Error ? err.message : String(err),
                    }))
                    : await fetch("/api/plugins/doctor", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: probeUrl }),
                    }).then((res) => res.json());

                probeItems.push(`HTTP: ${probe.status ?? "n/a"} (${probe.ok ? "ok" : "failed"})`);
                if (probe.contentType) probeItems.push(`Content: ${probe.contentType}`);
                if (probe.shape) probeItems.push(`Shape: ${probe.shape}`);
                if (probe.responseMs !== undefined) probeItems.push(`Latency: ${probe.responseMs} ms`);
                if (!probe.ok) tone = tone === "bad" ? "bad" : "warn";
            } else {
                probeItems.push("Probe: unavailable");
            }

            setResults((prev) => ({
                ...prev,
                [pluginId]: {
                    tone,
                    summary: tone === "ok" ? "Healthy" : tone === "warn" ? "Needs attention" : tone === "bad" ? "Failing" : "No live data yet",
                    sections: [
                        { title: "Registration", items: registrationItems },
                        { title: "Source", items: sourceItems },
                        { title: "Probe", items: probeItems },
                        { title: "Entities", items: entityItems },
                    ],
                    checkedAt: Date.now(),
                },
            }));
        } finally {
            setRunning((prev) => ({ ...prev, [pluginId]: false }));
        }
    };

    /**
     * Runs diagnostics for every managed plugin.
     */
    const runAll = () => {
        for (const managed of managedPlugins) {
            void runCheck(managed.plugin.id);
        }
    };

    /**
     * Forces a data refresh for an enabled plugin.
     *
     * @param pluginId - Plugin identifier to refresh.
     */
    const runRefresh = async (pluginId: string) => {
        const managed = pluginManager.getPlugin(pluginId);
        const isEnabled = layers[pluginId]?.enabled ?? false;
        if (!managed || !isEnabled) return;
        setRefreshing((prev) => ({ ...prev, [pluginId]: true }));
        try {
            const managerWithRefresh = pluginManager as typeof pluginManager & {
                refreshPlugin?: (id: string) => Promise<void>;
            };
            if (managerWithRefresh.refreshPlugin) {
                await managerWithRefresh.refreshPlugin(pluginId);
                return;
            }
            await pluginManager.fetchForPlugin(pluginId, useStore.getState().timeRange);
        } finally {
            setRefreshing((prev) => ({ ...prev, [pluginId]: false }));
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
              const runtimeState = getFeedRuntimeState(
                  Boolean(layer?.enabled),
                  layer,
                  health,
                  entitiesByPlugin[plugin.id]?.length ?? layer?.entityCount ?? 0,
              );
              const tone = result?.tone ?? toneForFeedState(runtimeState);
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
                      <span>{result?.summary ?? labelForFeedState(runtimeState)}</span>
                      <span>{(entitiesByPlugin[plugin.id]?.length ?? 0).toLocaleString()} entities</span>
                      {health?.sourceName && <span>{health.sourceName}</span>}
                    </div>
                    {result && (
                      <div className="plugin-doctor-row__sections">
                        {result.sections.map((section) => (
                          <div key={section.title} className="plugin-doctor-row__section">
                            <div className="plugin-doctor-row__section-title">{section.title}</div>
                            <ul className="plugin-doctor-row__section-items">
                              {section.items.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
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
                    <button
                      type="button"
                      onClick={() => void runRefresh(plugin.id)}
                      disabled={!layer?.enabled || refreshing[plugin.id]}
                      title={layer?.enabled ? "Retry fetch" : "Enable the layer to retry fetch"}
                    >
                      <RefreshCw size={12} />
                      {refreshing[plugin.id] ? "Retrying" : "Retry fetch"}
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
