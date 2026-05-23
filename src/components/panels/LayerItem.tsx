"use client";

/**
 * @file LayerItem.tsx
 * @description Individual layer item component used within the LayerPanel.
 * Displays plugin metadata, status indicators, and toggle controls.
 * @module src/components/panels
 */

import { ShieldAlert } from "lucide-react";
import { PluginIcon } from "@/components/common/PluginIcon";
import { Tooltip } from "@/components/ui/Tooltip";
import { getPluginTrust } from "@/core/plugins/pluginMetadata";
import type { WorldPlugin } from "@/core/plugins/PluginTypes";
import { useStore } from "@/core/state/store";
import "./LayerItem.css";

// ─── Trust Helpers ──────────────────────────────────────────

type TrustTier = "built-in" | "verified" | "unverified";

function getTrust(pluginId: string): TrustTier {
    return getPluginTrust(pluginId);
}

function TrustIcon({ trust }: { trust: TrustTier }) {
    if (trust !== "unverified") return null;

    return (
      <Tooltip content="Unverified plugin, use at your own risk">
        <span className="layer-item__unverified-icon-wrapper">
          <ShieldAlert
            size={12}
            className="layer-item__unverified-icon"
            aria-label="Unverified plugin"
          />
        </span>
      </Tooltip>
    );
}

// ─── LayerItem Component ────────────────────────────────────

/**
 * @interface LayerItemProps
 * @description Properties for the LayerItem component.
 * @property {WorldPlugin} plugin - The plugin instance to represent.
 * @property {boolean} isEnabled - Whether the layer is currently active on the globe.
 * @property {boolean} isLoading - Whether the layer is currently fetching data.
 * @property {number} entityCount - The number of entities currently rendered for this layer.
 * @property {boolean} [isSelected] - Whether this layer is focused in the config panel.
 * @property {function} onToggle - Callback to toggle the layer's enabled state.
 * @property {function} [onSelect] - Callback to focus the layer in the config panel.
 */
interface LayerItemProps {
    plugin: WorldPlugin;
    isEnabled: boolean;
    isLoading: boolean;
    entityCount: number;
    isSelected?: boolean;
    onToggle: () => void;
    onSelect?: () => void;
}

/**
 * @component LayerItem
 * @description A list item representing a single data layer with status feedback.
 */
export function LayerItem({
    plugin,
    isEnabled,
    isLoading,
    entityCount,
    isSelected,
    onToggle,
    onSelect,
}: LayerItemProps) {
    const trust = getTrust(plugin.id);
    const health = useStore((s) => s.sourceHealthByPlugin[plugin.id]);
    const healthStatus = isEnabled ? health?.status ?? (isLoading ? "loading" : "idle") : "idle";
    const healthLabel = healthStatus === "healthy"
        ? "Healthy"
        : healthStatus === "degraded"
            ? "Degraded"
            : healthStatus === "error"
                ? "Error"
                : healthStatus === "stale"
                    ? "Stale"
                    : healthStatus === "loading" || isLoading
                        ? "Loading"
                        : "Idle";
    const healthTitle = [
        health?.sourceName,
        healthLabel,
        health?.lastSuccessAt ? `last success ${new Date(health.lastSuccessAt).toLocaleTimeString()}` : null,
        health?.lastErrorMessage,
    ].filter(Boolean).join(" · ");

    return (
      <div
        className={`layer-item ${isSelected ? "layer-item--selected" : ""}`}
        onClick={onSelect}
      >
        <span className="layer-item__icon">
          <PluginIcon icon={plugin.icon} size={18} />
        </span>

        <div className="layer-item__info">
          <div className="layer-item__header">
            <span className="layer-item__name">{plugin.name}</span>
            <TrustIcon trust={trust} />
          </div>
          <div className="layer-item__desc">{plugin.description}</div>
          <div className="layer-item__footer">
            {isEnabled && (
              <span
                className={`layer-item__health layer-item__health--${healthStatus}`}
                title={healthTitle || healthLabel}
              >
                {healthLabel}
              </span>
            )}
            {isEnabled && !isLoading && entityCount > 0 && (
              <span className="layer-item__count">
                {entityCount.toLocaleString()}
              </span>
                    )}
          </div>
        </div>

        {isEnabled && isLoading && (
          <span className="layer-item__spinner" aria-label="Loading" />
            )}

        <div
          className={`layer-item__toggle ${isEnabled ? "layer-item__toggle--on" : ""}`}
          onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
        />
      </div>
    );
}
