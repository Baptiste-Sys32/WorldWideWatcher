/**
 * @file DataBusSubscriber.tsx
 * @description Headless component that bridges the DataBus event system with the Zustand store.
 * Handles automatic WebSocket subscription/unsubscription when layers are toggled.
 * @module src/components/layout
 */

"use client";

import { useEffect } from "react";
import { useStore } from "@/core/state/store";
import { dataBus } from "@/core/data/DataBus";
import { pluginManager } from "@/core/plugins/PluginManager";
import { wsClient } from "@/core/data/WsClient";
import { resolveEngineUrl } from "@/core/data/resolveEngineUrl";
import { fetchLocalEngineManifest } from "@/core/data/engineManifest";

/**
 * @component DataBusSubscriber
 * @description Orchestrates side-effects between the event-driven DataBus and the React state store.
 * This component renders no UI; it strictly manages the data pipeline lifecycle.
 */
export function DataBusSubscriber() {
    const setPollingInterval = useStore((s) => s.setPollingInterval);
    const setEntities = useStore((s) => s.setEntities);
    const setEntityCount = useStore((s) => s.setEntityCount);
    const clearEntities = useStore((s) => s.clearEntities);
    const removeLayer = useStore((s) => s.removeLayer);
    const setLayerLoading = useStore((s) => s.setLayerLoading);
    const setSourceHealth = useStore((s) => s.setSourceHealth);
    const clearSourceHealth = useStore((s) => s.clearSourceHealth);
    const showErrorToast = useStore((s) => s.showErrorToast);
    const cacheMaxAge = useStore((s) => s.dataConfig.cacheMaxAge);

    useEffect(() => {
        // Detect local engine before subscribing to plugins
        fetchLocalEngineManifest();
        pluginManager.setCacheMaxAge(cacheMaxAge);
    }, [cacheMaxAge]);

    useEffect(() => {
        const unsubReg = dataBus.on("pluginRegistered", ({ pluginId, defaultInterval }) => {
            setTimeout(() => {
                const currentIntervals = useStore.getState().dataConfig.pollingIntervals;
                if (!currentIntervals[pluginId]) {
                    setPollingInterval(pluginId, defaultInterval);
                }
            }, 0);
        });

        const unsubData = dataBus.on("dataUpdated", ({ pluginId, entities }) => {
            // Defer the state updates by one tick to prevent React "Maximum update depth exceeded"
            // errors during massive synchronous plugin loads (e.g. at boot).
            setTimeout(() => {
                setEntities(pluginId, entities);
                setEntityCount(pluginId, entities.length);
            }, 0);
        });

        const unsubToggle = dataBus.on("layerToggled", ({ pluginId, enabled }) => {
            const t0 = performance.now();
            console.debug(`[DataBusSubscriber] layerToggled event received for ${pluginId}, enabled: ${enabled}`);
            const engineUrl = resolveEngineUrl(pluginId);
            console.debug(`[DataBusSubscriber] Resolved engine URL for ${pluginId} to ${engineUrl}. Took ${(performance.now() - t0).toFixed(2)}ms`);
            if (enabled) {
                console.debug(`[DataBusSubscriber] Calling wsClient.subscribe(${pluginId}, ${engineUrl})`);
                wsClient.subscribe(pluginId, engineUrl);
            } else {
                console.debug(`[DataBusSubscriber] Calling wsClient.unsubscribe(${pluginId}, ${engineUrl})`);
                wsClient.unsubscribe(pluginId, engineUrl);
            }
        });

        const unsubUnreg = dataBus.on("pluginUnregistered", ({ pluginId }) => {
            setTimeout(() => {
                clearEntities(pluginId);
                removeLayer(pluginId);
                clearSourceHealth(pluginId);
            }, 0);
        });

        const unsubLoading = dataBus.on("layerLoadingChanged", ({ pluginId, loading }) => {
            setTimeout(() => {
                setLayerLoading(pluginId, loading);
            }, 0);
        });

        const unsubError = dataBus.on("pluginError", ({ message }) => {
            setTimeout(() => {
                if (showErrorToast) {
                    showErrorToast(message);
                }
            }, 0);
        });

        const unsubHealth = dataBus.on("sourceHealthChanged", ({ pluginId, patch }) => {
            setTimeout(() => {
                setSourceHealth(pluginId, patch);
            }, 0);
        });

        return () => {
            unsubReg();
            unsubUnreg();
            unsubData();
            unsubToggle();
            unsubLoading();
            unsubError();
            unsubHealth();
        };
    }, [setPollingInterval, setEntities, setEntityCount, clearEntities, removeLayer, setLayerLoading, setSourceHealth, clearSourceHealth, showErrorToast]);

    return null;
}
