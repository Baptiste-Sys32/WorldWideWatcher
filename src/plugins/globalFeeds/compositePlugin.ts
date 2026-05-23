import {
    useEffect,
    useMemo,
} from "react";
import {
    Cartesian3,
    Color,
    ColorMaterialProperty,
    CustomDataSource,
    HeightReference,
    PolygonHierarchy,
} from "cesium";
import type { Viewer as CesiumViewer } from "cesium";
import {
    Activity,
    BellRing,
    Leaf,
    Radio,
    RadioTower,
    Satellite,
    Signal,
    ThermometerSun,
    Waves,
} from "lucide-react";
import { cellToBoundary, cellToLatLng, latLngToCell } from "h3-js";
import type {
    CesiumEntityOptions,
    FilterValue,
    GeoEntity,
    LayerConfig,
    PluginContext,
    WorldPlugin,
} from "@/core/plugins/PluginTypes";
import { dataBus } from "@/core/data/DataBus";
import { applyFilters } from "@/core/filters/filterEngine";
import { useStore } from "@/core/state/store";
import { isEntityVisibleInTimeline } from "@/core/timeline/timelineFilter";
import { BUILT_IN_GLOBAL_FEED_IDS, type FeedResponse, type GlobalFeedId } from "./types";

const FEED_META: Record<GlobalFeedId, {
    name: string;
    description: string;
    color: string;
    icon: WorldPlugin["icon"];
    category?: WorldPlugin["category"];
}> = {
    "tropical-cyclones": {
        name: "Tropical Cyclones",
        description: "Global tropical cyclone events with France territory alerts piggybacked.",
        color: "#f97316",
        icon: RadioTower,
    },
    "flood-alerts": {
        name: "Flood Alerts",
        description: "Global flood events merged with Vigicrues hydrometry stations in France.",
        color: "#0ea5e9",
        icon: Waves,
    },
    "drought-vegetation": {
        name: "Drought / Vegetation Stress",
        description: "Global drought and vegetation stress markers merged with French water restrictions.",
        color: "#a16207",
        icon: Leaf,
    },
    "disease-outbreaks": {
        name: "Disease Outbreaks",
        description: "WHO disease outbreak markers merged with France public health indicators.",
        color: "#dc2626",
        icon: Activity,
    },
    "wildfire-hotspots": {
        name: "Wildfire Hotspots",
        description: "NASA FIRMS thermal hotspots, with NASA EONET wildfire fallback when no free FIRMS key is configured.",
        color: "#f43f5e",
        icon: ThermometerSun,
    },
    "air-quality": {
        name: "Air Quality Stations",
        description: "OpenAQ latest station readings with a no-key Open-Meteo PM2.5 fallback grid.",
        color: "#84cc16",
        icon: Radio,
        category: "weather",
    },
    "marine-buoys": {
        name: "Marine Buoys",
        description: "NOAA NDBC latest ocean station observations for wind, waves, pressure, and water temperature.",
        color: "#06b6d4",
        icon: Waves,
        category: "maritime",
    },
    satellites: {
        name: "Satellite Constellations",
        description: "CelesTrak GP data propagated to current approximate positions for stations, weather, and Starlink groups.",
        color: "#a78bfa",
        icon: Satellite,
        category: "space",
    },
    "gps-jamming": {
        name: "GPS Jamming",
        description: "GNSS interference observations from the WorldWideView GPSJam feed.",
        color: "#f97316",
        icon: Signal,
        category: "space",
    },
    "us-weather-alerts": {
        name: "US Weather Alerts",
        description: "NOAA/NWS active alert centroids for current watches and warnings. Scope: US only.",
        color: "#f59e0b",
        icon: BellRing,
        category: "weather",
    },
};

const SATELLITE_GROUPS = [
    { label: "Space Stations", value: "stations", color: "#00fff7" },
    { label: "Weather", value: "weather", color: "#a78bfa" },
    { label: "Starlink", value: "starlink", color: "#ffffff" },
];

const GPS_JAMMING_LEVELS = [
    { label: "High", value: "high", color: "#ef4444" },
    { label: "Medium", value: "medium", color: "#f97316" },
    { label: "Low", value: "low", color: "#eab308" },
    { label: "Unknown", value: "unknown", color: "#94a3b8" },
];

const GPS_H3_RESOLUTION = 3;
const GPS_HEX_TOP_HEIGHT_METERS = 2_800;
const GPS_HEX_BASE_HEIGHT_METERS = 0;
const GPS_HEX_OUTLINE_ALPHA = 0.96;
const GPS_HEX_FILL_ALPHA = 0.72;
const EMPTY_GPS_JAMMING_ENTITIES: GeoEntity[] = [];
const EMPTY_GPS_JAMMING_FILTERS: Record<string, FilterValue> = {};

const GPS_LEVEL_SCORE: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    unknown: 0,
};

function colorWithAlpha(hex: string, alpha: number): Color {
    return Color.fromCssColorString(hex).withAlpha(alpha);
}

type GpsJammingHexCell = {
    id: string;
    entity: GeoEntity;
    color: string;
    center: Cartesian3;
    positions: Cartesian3[];
};

function GpsJammingHexOverlay({ viewer, enabled }: { viewer: CesiumViewer | null; enabled: boolean }) {
    const entities = useStore((s) => s.entitiesByPlugin["gps-jamming"] ?? EMPTY_GPS_JAMMING_ENTITIES);
    const filters = useStore((s) => s.filters["gps-jamming"] ?? EMPTY_GPS_JAMMING_FILTERS);
    const isPlaybackMode = useStore((s) => s.isPlaybackMode);
    const timeRange = useStore((s) => s.timeRange);
    const settings = useStore((s) => s.dataConfig.pluginSettings["gps-jamming"]);

    const visibleHexCells = useMemo<GpsJammingHexCell[]>(() => {
        const colorOverrides = settings?.colorOverrides as Record<string, string> | undefined;
        const customLayerColor = settings?.customLayerColor as string | undefined;
        const cellMap = new Map<string, {
            entity: GeoEntity;
            score: number;
            count: number;
        }>();

        applyFilters(entities, [
            {
                id: "interference-level",
                label: "Interference",
                type: "select",
                propertyKey: "interferenceLevel",
                options: GPS_JAMMING_LEVELS.map((item) => ({ label: item.label, value: item.value })),
            },
            {
                id: "region",
                label: "Region",
                type: "text",
                propertyKey: "region",
            },
        ], filters).filter((entity) => (
            isEntityVisibleInTimeline(entity, { playbackMode: isPlaybackMode, timeRange })
        )).forEach((entity) => {
            const cell = latLngToCell(entity.latitude, entity.longitude, GPS_H3_RESOLUTION);
            const level = String(entity.properties?.interferenceLevel ?? entity.properties?.severity ?? "unknown").toLowerCase();
            const score = GPS_LEVEL_SCORE[level] ?? GPS_LEVEL_SCORE.unknown;
            const existing = cellMap.get(cell);

            if (!existing || score > existing.score) {
                cellMap.set(cell, {
                    entity,
                    score,
                    count: (existing?.count ?? 0) + 1,
                });
                return;
            }

            existing.count++;
        });

        return Array.from(cellMap.entries()).map(([cell, { entity, count }]) => {
            const [latitude, longitude] = cellToLatLng(cell);
            const boundary = cellToBoundary(cell);
            const positions = boundary.map(([lat, lon]) => Cartesian3.fromDegrees(lon, lat, GPS_HEX_TOP_HEIGHT_METERS));
            const hexEntity: GeoEntity = {
                ...entity,
                id: `gps-jamming-h3-${cell}`,
                latitude,
                longitude,
                label: `${entity.properties?.region ?? "GPS"} interference (${count} reports)`,
                properties: {
                    ...entity.properties,
                    h3Cell: cell,
                    density: count,
                },
            };
            const baseColor = severityColor(hexEntity, FEED_META["gps-jamming"].color);
            const color = colorOverrides?.[baseColor] ?? customLayerColor ?? baseColor;
            return {
                id: cell,
                entity: hexEntity,
                color,
                center: Cartesian3.fromDegrees(longitude, latitude, 0),
                positions,
            };
        });
    }, [entities, filters, isPlaybackMode, settings, timeRange]);

    useEffect(() => {
        if (!viewer || !enabled || typeof viewer.isDestroyed === "function" && viewer.isDestroyed()) return;

        const source = new CustomDataSource("gps-jamming-hexes");
        viewer.dataSources.add(source);

        const globeRadius = viewer.scene.globe.ellipsoid.maximumRadius;
        const horizonDistanceSquared = globeRadius * globeRadius;
        const renderedCells: Array<{ cesiumEntity: ReturnType<typeof source.entities.add>; center: Cartesian3 }> = [];

        visibleHexCells.forEach(({ entity, color, center, positions }) => {
            const outlineMaterial = new ColorMaterialProperty(colorWithAlpha(color, GPS_HEX_OUTLINE_ALPHA));
            const cesiumEntity = source.entities.add({
                id: entity.id,
                name: entity.label,
                position: Cartesian3.fromDegrees(entity.longitude, entity.latitude, entity.altitude || 0),
                polygon: {
                    hierarchy: new PolygonHierarchy(positions),
                    material: new ColorMaterialProperty(colorWithAlpha(color, GPS_HEX_FILL_ALPHA)),
                    outline: true,
                    outlineColor: colorWithAlpha(color, GPS_HEX_OUTLINE_ALPHA),
                    outlineWidth: 2,
                    perPositionHeight: false,
                    height: GPS_HEX_TOP_HEIGHT_METERS,
                    heightReference: HeightReference.RELATIVE_TO_GROUND,
                    extrudedHeight: GPS_HEX_BASE_HEIGHT_METERS,
                    extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
                    closeTop: true,
                    closeBottom: true,
                },
                polyline: {
                    positions: [...positions, positions[0]],
                    material: outlineMaterial,
                    width: 2.5,
                    clampToGround: false,
                },
                properties: { _wwvEntity: entity },
            });
            renderedCells.push({ cesiumEntity, center });
        });

        const updateHorizonVisibility = () => {
            const cameraPosition = viewer.camera.positionWC;
            let changed = false;
            renderedCells.forEach(({ cesiumEntity, center }) => {
                const shouldShow = Cartesian3.dot(center, cameraPosition) > horizonDistanceSquared;
                if (cesiumEntity.show !== shouldShow) {
                    cesiumEntity.show = shouldShow;
                    changed = true;
                }
            });
            if (changed) viewer.scene.requestRender();
        };

        updateHorizonVisibility();
        const removePreRender = viewer.scene.preRender.addEventListener(updateHorizonVisibility);
        viewer.scene.requestRender();

        return () => {
            removePreRender();
            if (!viewer.isDestroyed?.()) {
                viewer.dataSources.remove(source, true);
                viewer.scene.requestRender();
            }
        };
    }, [enabled, viewer, visibleHexCells]);

    return null;
}

function severityColor(entity: GeoEntity, fallback: string): string {
    if (entity.pluginId === "satellites") {
        const group = String(entity.properties?.orbitGroup ?? "").toLowerCase();
        return SATELLITE_GROUPS.find((item) => item.value === group)?.color ?? fallback;
    }
    if (entity.pluginId === "gps-jamming") {
        const level = String(entity.properties?.interferenceLevel ?? entity.properties?.severity ?? "").toLowerCase();
        return GPS_JAMMING_LEVELS.find((item) => item.value === level)?.color ?? fallback;
    }
    const severity = String(entity.properties?.severity ?? "").toLowerCase();
    const parameter = String(entity.properties?.parameter ?? "").toLowerCase();
    const numericSeverity = Number(entity.properties?.severity ?? entity.properties?.value ?? entity.properties?.brightness);
    if (parameter.includes("pm") && Number.isFinite(numericSeverity)) {
        if (numericSeverity > 55) return "#7f1d1d";
        if (numericSeverity > 35) return "#dc2626";
        if (numericSeverity > 12) return "#f59e0b";
        return "#22c55e";
    }
    if (String(entity.properties?.eventType) === "wildfire-hotspot" && Number.isFinite(numericSeverity)) {
        if (numericSeverity > 330) return "#ef4444";
        if (numericSeverity > 300) return "#f97316";
        return "#f59e0b";
    }
    if (["red", "rouge", "4", "extreme", "severe"].some((value) => severity.includes(value))) return "#ef4444";
    if (["orange", "3", "high"].some((value) => severity.includes(value))) return "#f97316";
    if (["yellow", "jaune", "2", "medium", "moderate"].some((value) => severity.includes(value))) return "#eab308";
    if (["green", "vert", "1", "low"].some((value) => severity.includes(value))) return "#22c55e";
    return fallback;
}

/**
 * Creates a composite global feed plugin that merges global + France sources.
 *
 * @param id - Global feed identifier.
 * @returns A WorldPlugin definition wired to the global feeds API.
 */
export function createGlobalFeedPlugin(id: GlobalFeedId): WorldPlugin {
    const meta = FEED_META[id];
    let context: PluginContext | null = null;

    return {
        id,
        name: meta.name,
        description: meta.description,
        icon: meta.icon,
        category: meta.category ?? "natural-disaster",
        version: "1.0.0",

        async initialize(ctx: PluginContext): Promise<void> {
            context = ctx;
        },

        destroy(): void {
            context = null;
        },

        async fetch(): Promise<GeoEntity[]> {
            const baseUrl = typeof window !== "undefined"
                ? window.location.origin
                : context?.apiBaseUrl ?? "";
            const response = await fetch(`${baseUrl}/api/feeds/${id}`);
            if (!response.ok) {
                throw new Error(`${meta.name} feed returned HTTP ${response.status}`);
            }
            const body = await response.json() as Partial<FeedResponse>;
            const items = Array.isArray(body.items)
                ? body.items.map((entity) => ({ ...entity, pluginId: id, timestamp: new Date(entity.timestamp) }))
                : [];
            if (Array.isArray(body.sources)) {
                const failedSources = body.sources.filter((source) => !source.ok);
                const sourceHealthPatch = {
                    status: failedSources.length > 0 ? "degraded" as const : "healthy" as const,
                    sourceName: meta.name,
                    sourceUrl: `/api/feeds/${id}`,
                    sourceType: "composite" as const,
                    sources: body.sources,
                    lastErrorMessage: failedSources.map((source) => source.errorMessage).filter(Boolean).join("; ") || null,
                };
                Object.defineProperty(items, "__wwvSourceHealthPatch", {
                    value: sourceHealthPatch,
                    enumerable: false,
                });
                dataBus.emit("sourceHealthChanged", {
                    pluginId: id,
                    patch: sourceHealthPatch,
                });
            }
            return items;
        },

        getPollingInterval(): number {
            return 5 * 60 * 1000;
        },

        getLayerConfig(): LayerConfig {
            return {
                color: meta.color,
                clusterEnabled: id !== "satellites",
                clusterDistance: id === "gps-jamming" ? 40 : 55,
                maxEntities: 5_000,
                disableDefaultRendering: id === "gps-jamming",
            };
        },

        getServerConfig() {
            return {
                apiBasePath: `/api/feeds/${id}`,
                pollingIntervalMs: 5 * 60 * 1000,
                transportMode: "polling" as const,
                sourceName: meta.name,
                sourceUrl: `/api/feeds/${id}`,
                doctor: {
                    enabled: true,
                    probePath: `/api/feeds/${id}`,
                    expectedShape: "items" as const,
                },
            };
        },

        renderEntity(entity: GeoEntity): CesiumEntityOptions {
            const color = severityColor(entity, meta.color);
            return {
                type: "point",
                color,
                outlineColor: entity.properties?.sourceScope === "france" ? "#ffffff" : "#0f172a",
                outlineWidth: 1,
                size: entity.pluginId === "gps-jamming"
                    ? 10
                    : entity.properties?.sourceScope === "france" ? 9 : 7,
                labelText: entity.label,
                disableDepthTestDistance: entity.pluginId === "satellites" ? 20_000_000 : 2_000_000,
                disableClustering: entity.pluginId === "satellites",
            };
        },
        ...(id === "gps-jamming"
            ? { getGlobeComponent: () => GpsJammingHexOverlay }
            : {}),

        getFilterDefinitions() {
            if (id === "satellites") {
                return [{
                    id: "orbit-group",
                    label: "Orbit Group",
                    type: "select" as const,
                    propertyKey: "orbitGroup",
                    options: SATELLITE_GROUPS.map((item) => ({ label: item.label, value: item.value })),
                }];
            }
            if (id === "gps-jamming") {
                return [
                    {
                        id: "interference-level",
                        label: "Interference",
                        type: "select" as const,
                        propertyKey: "interferenceLevel",
                        options: GPS_JAMMING_LEVELS.map((item) => ({ label: item.label, value: item.value })),
                    },
                    {
                        id: "region",
                        label: "Region",
                        type: "text" as const,
                        propertyKey: "region",
                    },
                ];
            }
            return [];
        },

        getLegend() {
            if (id === "satellites") {
                return SATELLITE_GROUPS.map((item) => ({
                    label: item.label,
                    color: item.color,
                    filterId: "orbit-group",
                    filterValue: item.value,
                }));
            }
            if (id === "gps-jamming") {
                return GPS_JAMMING_LEVELS.map((item) => ({
                    label: item.label,
                    color: item.color,
                    filterId: "interference-level",
                    filterValue: item.value,
                }));
            }
            return [];
        },
    };
}

export const globalFeedPlugins = BUILT_IN_GLOBAL_FEED_IDS.map(createGlobalFeedPlugin);
