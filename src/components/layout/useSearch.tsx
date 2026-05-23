"use client";

import { useState, useEffect, useMemo } from "react";
import {
    Clock,
    Command,
    Layers,
} from "lucide-react";
import { useStore } from "@/core/state/store";
import { dataBus } from "@/core/data/DataBus";
import { pluginManager } from "@/core/plugins/PluginManager";
import { WEATHER_OVERLAY_PLUGIN_IDS, type WeatherOverlayPluginId } from "@/plugins/weather/weatherOverlayPlugins";
import { trackEvent } from "@/lib/analytics";
import { getZoomForTypes } from "./placeCategories";
import { useSearchHistory } from "./useSearchHistory";
import type { SearchResult, SearchSection } from "./searchTypes";
import { searchEntities } from "./searchEntities";
import { searchLocations } from "./searchLocations";

export type { SearchResult, SearchSection };

const WEATHER_PLUGIN_IDS = new Set<string>(WEATHER_OVERLAY_PLUGIN_IDS);

function commandScore(label: string, subLabel: string, query: string, base: number): number {
    const haystack = `${label} ${subLabel}`.toLowerCase();
    const normalizedLabel = label.toLowerCase();
    if (normalizedLabel === query) return base + 60;
    if (normalizedLabel.replace(/^open /, "") === query) return base + 55;
    if (normalizedLabel.startsWith(query)) return base + 45;
    if (haystack.includes(query)) return base;
    return -1;
}

function isWeatherPluginId(pluginId: string): pluginId is WeatherOverlayPluginId {
    return WEATHER_PLUGIN_IDS.has(pluginId);
}

export function useSearch() {
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [liveSections, setLiveSections] = useState<SearchSection[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [lastSearchedPlace, setLastSearchedPlace] = useState<SearchResult | null>(null);
    const setCameraPosition = useStore((s) => s.setCameraPosition);
    const setSelectedEntity = useStore((s) => s.setSelectedEntity);
    const setActiveLayerPanelTab = useStore((s) => s.setActiveLayerPanelTab);
    const setActiveRightOverlay = useStore((s) => s.setActiveRightOverlay);
    const setActiveBottomPanel = useStore((s) => s.setActiveBottomPanel);
    const setConfigPanelOpen = useStore((s) => s.setConfigPanelOpen);
    const setPlaybackMode = useStore((s) => s.setPlaybackMode);
    const { history, addToHistory, clearHistory } = useSearchHistory();

    const sections: SearchSection[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            if (history.length === 0) return [];
            return [{
 title: "Recent", icon: <Clock size={16} />, results: history, maxScore: 0
}];
        }
        const matchingHistory = history.filter(
            (r) => r.label.toLowerCase().includes(q)
                || (r.subLabel && r.subLabel.toLowerCase().includes(q))
        );
        const recentSection: SearchSection | null = matchingHistory.length > 0
                ? {
 title: "Recent", icon: <Clock size={16} />, results: matchingHistory, maxScore: 99
}
                : null;
        return recentSection ? [recentSection, ...liveSections] : liveSections;
    }, [query, history, liveSections]);

    const flatResults = sections.flatMap((s) => s.results);

    useEffect(() => {
        let isStale = false;

        const run = async () => {
            if (!query.trim()) {
                setLiveSections((prev) => (prev.length === 0 ? prev : []));
                setSelectedIndex((prev) => (prev === 0 ? prev : 0));
                return;
            }
            const currentLayers = useStore.getState().layers;
            const newSections = searchEntities(query, currentLayers);
            const q = query.trim().toLowerCase();
            const layerResults: SearchResult[] = pluginManager.getAllPlugins().flatMap(({ plugin }) => {
                const haystack = `${plugin.name} ${plugin.id} ${plugin.description} ${plugin.category}`.toLowerCase();
                if (!haystack.includes(q)) return [];
                const enabled = currentLayers[plugin.id]?.enabled ?? false;
                return [{
                    id: `layer:${plugin.id}`,
                    label: plugin.name,
                    subLabel: `${enabled ? "Enabled" : "Disabled"} layer · ${plugin.category}`,
                    score: plugin.name.toLowerCase() === q || plugin.id.toLowerCase() === q
                        ? 145
                        : plugin.name.toLowerCase().startsWith(q) || plugin.id.toLowerCase().startsWith(q)
                            ? 125
                            : 75,
                    lat: 0,
                    lon: 0,
                    type: "layer" as const,
                    resultLabel: "Layer",
                    pluginId: plugin.id,
                    action: () => {
                        const state = useStore.getState();
                        const isEnabled = state.layers[plugin.id]?.enabled;
                        if (isEnabled) {
                            pluginManager.disablePlugin(plugin.id);
                            state.setLayerEnabled(plugin.id, false);
                            state.clearEntities(plugin.id);
                            state.setEntityCount(plugin.id, 0);
                            if (isWeatherPluginId(plugin.id)) {
                                state.updateMapConfig({ weatherOverlay: null });
                            }
                        } else {
                            if (isWeatherPluginId(plugin.id)) {
                                for (const weatherPluginId of WEATHER_OVERLAY_PLUGIN_IDS) {
                                    if (weatherPluginId === plugin.id) continue;
                                    pluginManager.disablePlugin(weatherPluginId);
                                    state.setLayerEnabled(weatherPluginId, false);
                                    state.clearEntities(weatherPluginId);
                                    state.setEntityCount(weatherPluginId, 0);
                                }
                                state.updateMapConfig({ weatherOverlay: plugin.id });
                            }
                            void pluginManager.enablePlugin(plugin.id);
                            state.setLayerEnabled(plugin.id, true);
                        }
                        state.setHighlightLayerId(plugin.id);
                        state.setActiveLayerPanelTab("data");
                        state.setConfigPanelOpen(true);
                    },
                }];
            }).sort((a, b) => b.score - a.score).slice(0, 8);
            if (layerResults.length > 0) {
                newSections.push({
                    title: "Layers",
                    icon: <Layers size={16} />,
                    results: layerResults,
                    maxScore: layerResults[0].score,
                });
            }

            const commandCandidates: SearchResult[] = [
                {
                    id: "command:weather",
                    label: "Open Weather",
                    subLabel: "Show weather feeds and overlays",
                    type: "command",
                    score: 0,
                    lat: 0,
                    lon: 0,
                    resultLabel: "Command",
                    action: () => setActiveLayerPanelTab("data"),
                },
                {
                    id: "command:imagery",
                    label: "Open Imagery",
                    subLabel: "Switch map imagery and view mode",
                    type: "command",
                    score: 0,
                    lat: 0,
                    lon: 0,
                    resultLabel: "Command",
                    action: () => setActiveLayerPanelTab("imagery"),
                },
                {
                    id: "command:doctor",
                    label: "Open Plugin Doctor",
                    subLabel: "Diagnostics, source health, and plugin probes",
                    type: "doctor",
                    score: 0,
                    lat: 0,
                    lon: 0,
                    resultLabel: "Command",
                    action: () => {
                        setActiveLayerPanelTab("settings");
                        setConfigPanelOpen(true);
                    },
                },
                {
                    id: "command:timeline",
                    label: "Open Timeline",
                    subLabel: "Playback mode and time filtering",
                    type: "command",
                    score: 0,
                    lat: 0,
                    lon: 0,
                    resultLabel: "Command",
                    action: () => setActiveBottomPanel("timeline"),
                },
                {
                    id: "command:layers",
                    label: "Open Layers",
                    subLabel: "Show the data feed list",
                    type: "command",
                    score: 0,
                    lat: 0,
                    lon: 0,
                    resultLabel: "Command",
                    action: () => setActiveLayerPanelTab("data"),
                },
                {
                    id: "command:enabled-layers",
                    label: "Show Enabled Layers",
                    subLabel: "Filter the layer panel to active feeds",
                    type: "command",
                    score: 0,
                    lat: 0,
                    lon: 0,
                    resultLabel: "Command",
                    action: () => {
                        setActiveLayerPanelTab("data");
                        setConfigPanelOpen(true);
                    },
                },
                {
                    id: "command:plugins",
                    label: "Open Plugins",
                    subLabel: "Manage installed plugins",
                    type: "plugin",
                    score: 0,
                    lat: 0,
                    lon: 0,
                    resultLabel: "Command",
                    action: () => setActiveLayerPanelTab("plugins"),
                },
                {
                    id: "command:filters",
                    label: "Open Filters",
                    subLabel: "Time frame and entity filters",
                    type: "command",
                    score: 0,
                    lat: 0,
                    lon: 0,
                    resultLabel: "Command",
                    action: () => setActiveRightOverlay("filters"),
                },
                {
                    id: "command:playback",
                    label: "Toggle Playback Mode",
                    subLabel: "Filter visible entities by timeline range",
                    type: "command",
                    score: 0,
                    lat: 0,
                    lon: 0,
                    resultLabel: "Command",
                    action: () => setPlaybackMode(!useStore.getState().isPlaybackMode),
                },
            ];
            const commandResults = commandCandidates
                .map((result) => ({ ...result, score: commandScore(result.label, result.subLabel ?? "", q, 100) }))
                .filter((result) => result.score >= 0)
                .sort((a, b) => b.score - a.score);
            if (commandResults.length > 0) {
                newSections.push({
                    title: "Commands",
                    icon: <Command size={16} />,
                    results: commandResults,
                    maxScore: commandResults[0].score,
                });
            }

            const locationSection = await searchLocations(query);
            if (isStale) return;
            if (locationSection) newSections.push(locationSection);
            newSections.sort((a, b) => b.maxScore - a.maxScore);
            setLiveSections(newSections);
            setSelectedIndex(0);
        };

        const timer = setTimeout(run, 300);
        return () => { isStale = true; clearTimeout(timer); };
    }, [query, setActiveBottomPanel, setActiveLayerPanelTab, setActiveRightOverlay, setConfigPanelOpen, setPlaybackMode]);

    const handleSelect = async (result: SearchResult) => {
        if (result.disabled || result.type === "notice") return;
        if (result.type === "entity" || result.type === "place" || result.type === "address" || result.type === "country") {
            addToHistory(result);
        }
        setIsOpen(false);
        setQuery("");
        trackEvent("search-select", { type: result.type, label: result.label });
        trackEvent("search-query", { query: result.label });
        if (result.action) {
            await result.action();
        } else if (result.type === "entity" && result.entity) {
            dataBus.emit("cameraGoTo", {
                lat: result.lat,
                lon: result.lon,
                alt: result.entity.altitude || 0
            });
            setSelectedEntity(result.entity);
        } else if (result.type === "country" || result.type === "place" || result.type === "address") {
            setSelectedEntity(null);
            try {
                const res = await fetch(`/api/places/details?place_id=${result.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.lat && data.lon) {
                        const { distance, maxPitch } = getZoomForTypes(data.types, data.viewport);
                        dataBus.emit("cameraGoTo", {
                            lat: data.lat,
                            lon: data.lon,
                            alt: 0,
                            distance,
                            maxPitch,
                            heading: 0,
                            duration: result.type === "address" ? 3.0 : 2.0,
                        });
                        setCameraPosition(data.lat, data.lon, distance);
                        setLastSearchedPlace({
                            ...result,
                            label: data.name || result.label,
                            subLabel: data.formattedAddress || result.subLabel,
                            lat: data.lat,
                            lon: data.lon,
                        });
                    }
                }
            } catch (err) {
                console.error("Error fetching place details:", err);
            }
        }
    };

    const handleEnterSearch = async () => {
        if (!query.trim()) return;
        const firstAddressResult = flatResults.find((result) => (
            result.type === "address" || result.type === "place" || result.type === "country"
        ) && !result.disabled);
        if (firstAddressResult) {
            await handleSelect(firstAddressResult);
            return;
        }

        const locationSection = await searchLocations(query);
        const firstLookupResult = locationSection?.results.find((result) => (
            result.type === "address" || result.type === "place" || result.type === "country"
        ) && !result.disabled);
        if (firstLookupResult) {
            await handleSelect(firstLookupResult);
        } else if (locationSection) {
            setLiveSections((prev) => [locationSection, ...prev.filter((section) => section.title !== locationSection.title)]);
            setIsOpen(true);
        }
    };

    return {
        query,
setQuery,
isOpen,
setIsOpen,
        sections,
selectedIndex,
setSelectedIndex,
        flatResults,
handleSelect,
handleEnterSearch,
lastSearchedPlace,
clearLastSearchedPlace: () => setLastSearchedPlace(null),
clearHistory,
    };
}
