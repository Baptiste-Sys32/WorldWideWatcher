import { pluginManager } from "./PluginManager";
import { pluginRegistry } from "./PluginRegistry";
import type { WorldPlugin } from "./PluginTypes";
import type { PluginManifest, TrustTier } from "./PluginManifest";

export interface RuntimePluginMetadata {
    id: string;
    name: string;
    version: string;
    category: string;
    trust: TrustTier;
    enabledByDefault: boolean;
    manifest?: PluginManifest;
    plugin?: WorldPlugin;
}

export function resolvePluginMetadata(pluginId: string): RuntimePluginMetadata | null {
    const managed = pluginManager.getPlugin(pluginId);
    const plugin = managed?.plugin ?? pluginRegistry.get(pluginId);
    const manifest = pluginManager.getManifest(pluginId);
    if (!plugin && !manifest) return null;

    const trust = manifest?.trust ?? (plugin ? "built-in" : "unverified");
    return {
        id: pluginId,
        name: plugin?.name ?? manifest?.name ?? pluginId,
        version: plugin?.version ?? manifest?.version ?? "unknown",
        category: plugin?.category ?? manifest?.category ?? "custom",
        trust,
        enabledByDefault: false,
        manifest,
        plugin,
    };
}

export function getPluginTrust(pluginId: string): TrustTier {
    return resolvePluginMetadata(pluginId)?.trust ?? "unverified";
}
