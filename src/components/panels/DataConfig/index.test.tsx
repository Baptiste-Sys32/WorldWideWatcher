import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataConfigPanel } from "./index";

const fetchForPlugin = vi.hoisted(() => vi.fn(async () => {}));
const storeState = vi.hoisted(() => ({
    value: {
        configPanelOpen: true,
        openMobilePanel: null,
        setOpenMobilePanel: vi.fn(),
        toggleConfigPanel: vi.fn(),
        selectedEntity: null,
        highlightLayerId: "satellites",
        activeRightOverlay: null,
        setActiveRightOverlay: vi.fn(),
        timeWindow: "24h",
        setTimeWindow: vi.fn(),
        timeRange: { start: new Date(0), end: new Date(1) },
        layers: {
            satellites: { enabled: true, loading: false, entityCount: 2 },
            "static-layer": { enabled: true, loading: false, entityCount: 1 },
        },
        entitiesByPlugin: {
            satellites: [
                { id: "iss", pluginId: "satellites", latitude: 0, longitude: 0, timestamp: new Date(), properties: { orbitGroup: "stations" } },
                { id: "starlink", pluginId: "satellites", latitude: 0, longitude: 0, timestamp: new Date(), properties: { orbitGroup: "starlink" } },
            ],
            "static-layer": [
                { id: "static-1", pluginId: "static-layer", latitude: 0, longitude: 0, timestamp: new Date(), properties: {} },
            ],
        },
        sourceHealthByPlugin: {
            satellites: {
                status: "healthy",
                sources: [
                    { sourceName: "CelesTrak stations", scope: "stations", ok: true, count: 1 },
                    { sourceName: "CelesTrak starlink", scope: "starlink", ok: true, count: 1 },
                ],
            },
            "static-layer": { status: "healthy" },
        },
        filters: {},
        setFilter: vi.fn(),
        clearFilters: vi.fn(),
        setHighlightLayerId: vi.fn(),
        setSelectedEntity: vi.fn(),
        setPollingInterval: vi.fn(),
        dataConfig: {
            pollingIntervals: { satellites: 300_000 },
            cacheEnabled: true,
            cacheMaxAge: 3_600_000,
            retryAttempts: 3,
            pluginSettings: {},
        },
    },
}));

vi.mock("@/core/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/core/hooks/useResizablePanel", () => ({ useResizablePanel: () => ({ width: 370, startResizing: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/core/state/store", () => {
    const useStore = (selector: (state: typeof storeState.value) => unknown) => selector(storeState.value);
    useStore.getState = () => storeState.value;
    return { useStore };
});
vi.mock("@/core/plugins/PluginManager", () => ({
    pluginManager: {
        getPlugin: (pluginId: string) => {
            if (pluginId === "satellites") {
                return {
                    plugin: {
                        id: "satellites",
                        name: "Satellites",
                        description: "Orbital objects.",
                        icon: "Satellite",
                        category: "space",
                        version: "1.0.0",
                        getPollingInterval: () => 300_000,
                        getServerConfig: () => ({ transportMode: "polling", pollingIntervalMs: 300_000 }),
                        getLayerConfig: () => ({ disableDefaultRendering: false }),
                        getLegend: () => [],
                    },
                };
            }
            if (pluginId === "static-layer") {
                return {
                    plugin: {
                        id: "static-layer",
                        name: "Static Layer",
                        description: "Static objects.",
                        icon: "Box",
                        category: "custom",
                        version: "1.0.0",
                        getPollingInterval: () => 0,
                        getServerConfig: () => ({ transportMode: "static", pollingIntervalMs: 0 }),
                        getLayerConfig: () => ({ disableDefaultRendering: false }),
                        getLegend: () => [],
                    },
                };
            }
            return undefined;
        },
        getAllPlugins: () => [],
        fetchForPlugin,
        disablePlugin: vi.fn(),
        updateTimeRange: vi.fn(),
    },
}));

describe("DataConfigPanel", () => {
    it("cycles right panel modes from intel to feeds to filters to settings and back", () => {
        render(<DataConfigPanel />);
        const modeButton = screen.getByRole("button", { name: /current panel mode/i });

        expect(modeButton.getAttribute("aria-label")).toContain("Intel");
        fireEvent.click(modeButton);
        expect(modeButton.getAttribute("aria-label")).toContain("Feeds");
        fireEvent.click(modeButton);
        expect(modeButton.getAttribute("aria-label")).toContain("Filters");
        fireEvent.click(modeButton);
        expect(modeButton.getAttribute("aria-label")).toContain("Settings");
        fireEvent.click(modeButton);
        expect(modeButton.getAttribute("aria-label")).toContain("Intel");
    });

    it("refreshes an enabled feed through PluginManager without clearing existing entities", () => {
        render(<DataConfigPanel />);
        fireEvent.click(screen.getByRole("button", { name: /current panel mode/i }));
        fireEvent.click(screen.getAllByRole("button", { name: "Refresh feed" })[0]);

        expect(fetchForPlugin).toHaveBeenCalledWith("satellites", storeState.value.timeRange);
        expect(storeState.value.entitiesByPlugin.satellites).toHaveLength(2);
    });

    it("shows enabled feed rows and lets info focus a feed", () => {
        render(<DataConfigPanel />);
        fireEvent.click(screen.getByRole("button", { name: /current panel mode/i }));

        expect(screen.getByText("Satellites")).toBeTruthy();
        expect(screen.getByText("Static Layer")).toBeTruthy();
        expect(screen.getAllByText("Polling").length).toBeGreaterThan(0);
        expect(screen.getByText("Static")).toBeTruthy();

        fireEvent.click(screen.getAllByRole("button", { name: "Info" })[1]);
        expect(storeState.value.setSelectedEntity).toHaveBeenCalledWith(null);
        expect(storeState.value.setHighlightLayerId).toHaveBeenCalledWith("static-layer");
        expect(screen.getByRole("button", { name: /current panel mode/i }).getAttribute("aria-label")).toContain("Intel");
    });

    it("disables refresh for static or push/manual feeds", () => {
        render(<DataConfigPanel />);
        fireEvent.click(screen.getByRole("button", { name: /current panel mode/i }));

        expect(screen.getByRole("button", { name: "Push/manual feed" }).hasAttribute("disabled")).toBe(true);
    });

    it("renders cache, polling, and per-source rows in settings mode", () => {
        render(<DataConfigPanel />);
        const modeButton = screen.getByRole("button", { name: /current panel mode/i });
        fireEvent.click(modeButton);
        fireEvent.click(modeButton);
        fireEvent.click(modeButton);

        expect(screen.getByText("Cache")).toBeTruthy();
        expect(screen.getByText("CelesTrak stations")).toBeTruthy();
        expect(screen.getByText("CelesTrak starlink")).toBeTruthy();
        expect(screen.getAllByText("Polling seconds").length).toBeGreaterThan(0);
    });
});
