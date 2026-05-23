import { pluginRegistry } from "@/core/plugins/PluginRegistry";
import { globalFeedPlugins } from "./compositePlugin";

for (const plugin of globalFeedPlugins) {
    pluginRegistry.register(plugin);
}

export { createGlobalFeedPlugin, globalFeedPlugins } from "./compositePlugin";
export type { GlobalFeedId } from "./types";
