const ENGINE_PLUGIN_ALIASES: Record<string, string> = {
    "wildfire": "wildfires",
    "civil-unrest": "civilUnrest",
    "conflict-events": "conflictEvents",
    "cyber-attacks": "cyberAttacks",
    "international-sanctions": "sanctions",
    "gps-jamming": "gpsjam",
};

const ENGINE_PLUGIN_REVERSE_ALIASES: Record<string, string> = {
    wildfires: "wildfire",
    civilUnrest: "civil-unrest",
    conflictEvents: "conflict-events",
    cyberAttacks: "cyber-attacks",
    sanctions: "international-sanctions",
    gpsjam: "gps-jamming",
};

export function toEnginePluginId(pluginId: string): string {
    return ENGINE_PLUGIN_ALIASES[pluginId] ?? pluginId;
}

export function toRegistryPluginId(enginePluginId: string): string {
    if (ENGINE_PLUGIN_REVERSE_ALIASES[enginePluginId]) {
        return ENGINE_PLUGIN_REVERSE_ALIASES[enginePluginId];
    }
    const kebab = enginePluginId
        .replace(/_/g, "-")
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase();
    return ENGINE_PLUGIN_REVERSE_ALIASES[kebab] ?? kebab;
}

export function getPluginAliases(): Record<string, string> {
    return { ...ENGINE_PLUGIN_ALIASES };
}
