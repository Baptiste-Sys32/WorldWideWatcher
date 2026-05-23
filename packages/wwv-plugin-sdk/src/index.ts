/**
 * @file index.ts
 * @description Core SDK for WorldWideView plugin development.
 * Defines the foundational types, interfaces, and utilities required 
 * to build data seeders, visualizers, and UI extensions.
 * @module @worldwideview/wwv-plugin-sdk
 */

import type { ComponentType, ReactElement, ReactNode } from "react";
import ReactDefault from "react";
import * as React from "react";
import { Children, Fragment, createElement, isValidElement } from "react";

/** Standard SVG icon size (px) used by createSvgIconUrl when no size is given. */
export const DEFAULT_ICON_SIZE = 32;

/** Default dark background color for icon circles. */
const DEFAULT_BG_COLOR = "rgba(15, 23, 42, 0.85)";

const REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
const REACT_MEMO_TYPE = Symbol.for("react.memo");
const CASE_SENSITIVE_SVG_ATTRIBUTES = new Set(["viewBox"]);

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function toKebabCase(value: string): string {
    return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function styleObjectToString(style: Record<string, string | number>): string {
    return Object.entries(style)
        .map(([key, value]) => `${toKebabCase(key)}:${String(value)}`)
        .join(";");
}

function renderAttributes(props: Record<string, unknown>): string {
    const attributes: string[] = [];

    for (const [rawKey, rawValue] of Object.entries(props)) {
        if (
            rawKey === "children" ||
            rawKey === "ref" ||
            rawKey === "key" ||
            rawValue === undefined ||
            rawValue === null ||
            rawValue === false ||
            typeof rawValue === "function"
        ) {
            continue;
        }

        const key = rawKey === "className"
            ? "class"
            : rawKey.startsWith("aria-") || rawKey.startsWith("data-")
                || CASE_SENSITIVE_SVG_ATTRIBUTES.has(rawKey)
                ? rawKey
                : toKebabCase(rawKey);

        if (rawValue === true) {
            attributes.push(key);
            continue;
        }

        const value = rawKey === "style" && typeof rawValue === "object" && rawValue !== null
            ? styleObjectToString(rawValue as Record<string, string | number>)
            : String(rawValue);

        attributes.push(`${key}="${escapeHtml(value)}"`);
    }

    return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
}

function resolveComponentElement(element: ReactElement): ReactNode {
    const { type, props } = element;

    if (type === Fragment) {
        return (props as { children?: ReactNode }).children;
    }

    if (typeof type === "function") {
        return (type as (props: unknown) => ReactNode)(props);
    }

    if (typeof type === "object" && type !== null) {
        const component = type as {
            $$typeof?: symbol;
            render?: (props: unknown, ref: unknown) => ReactNode;
            type?: ComponentType<unknown>;
        };

        if (component.$$typeof === REACT_FORWARD_REF_TYPE && typeof component.render === "function") {
            const renderSource = String(component.render);
            if (renderSource.includes("iconNode") && renderSource.includes("lucide-")) {
                const iconProps = props as { size?: number; color?: string; stroke?: string };
                const size = iconProps.size ?? DEFAULT_ICON_SIZE;
                const stroke = iconProps.color ?? iconProps.stroke ?? "currentColor";

                return createElement(
                    "svg",
                    {
                        xmlns: "http://www.w3.org/2000/svg",
                        width: size,
                        height: size,
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke,
                        strokeWidth: 2,
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                    },
                    createElement("circle", { cx: 12, cy: 12, r: 3 }),
                    createElement("path", { d: "M12 2v20" }),
                    createElement("path", { d: "M2 12h20" }),
                );
            }
            return component.render(props, null);
        }

        if (component.$$typeof === REACT_MEMO_TYPE && component.type) {
            return createElement(component.type, props as Record<string, unknown>);
        }
    }

    return null;
}

function renderReactToStaticMarkup(node: ReactNode): string {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return escapeHtml(String(node));
    if (Array.isArray(node)) return node.map(renderReactToStaticMarkup).join("");

    if (!isValidElement(node)) {
        return Children.toArray(node).map(renderReactToStaticMarkup).join("");
    }

    if (typeof node.type !== "string") {
        return renderReactToStaticMarkup(resolveComponentElement(node));
    }

    const props = node.props as Record<string, unknown>;
    const children = renderReactToStaticMarkup(props.children as ReactNode);

    return `<${node.type}${renderAttributes(props)}>${children}</${node.type}>`;
}

function withSynchronousReactDispatcher<T>(render: () => T): T {
    const reactModules = [React, ReactDefault] as unknown as Array<{
        __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H: unknown };
        __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: {
            ReactCurrentDispatcher?: { current: unknown };
        };
    }>;
    const react19Internals = reactModules
        .map((reactModule) => reactModule.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE)
        .filter((value): value is { H: unknown } => Boolean(value));
    const react18Dispatchers = reactModules
        .map((reactModule) => reactModule.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
            ?.ReactCurrentDispatcher)
        .filter((value): value is { current: unknown } => Boolean(value));

    const previousReact19Dispatchers = react19Internals.map((reactInternal) => reactInternal.H);
    const previousReact18Dispatchers = react18Dispatchers.map((reactDispatcher) => reactDispatcher.current);
    const dispatcher = {
        useContext: (context: unknown) => {
            const values = context as { _currentValue?: unknown; _currentValue2?: unknown };
            return values?._currentValue ?? values?._currentValue2 ?? null;
        },
        useMemo: <V>(factory: () => V) => factory(),
        useCallback: <V>(callback: V) => callback,
        useRef: <V>(value: V) => ({ current: value }),
        useState: <V>(value: V | (() => V)) => [
            typeof value === "function" ? (value as () => V)() : value,
            () => {},
        ],
        useId: () => "",
    };

    try {
        react19Internals.forEach((reactInternal) => { reactInternal.H = dispatcher; });
        react18Dispatchers.forEach((reactDispatcher) => { reactDispatcher.current = dispatcher; });
        return render();
    } finally {
        react19Internals.forEach((reactInternal, index) => {
            reactInternal.H = previousReact19Dispatchers[index];
        });
        react18Dispatchers.forEach((reactDispatcher, index) => {
            reactDispatcher.current = previousReact18Dispatchers[index];
        });
    }
}

export interface IconUrlOptions extends Record<string, unknown> {
    /** Icon color (stroke). */
    color?: string;
    /** SVG icon size in px (default: DEFAULT_ICON_SIZE). */
    size?: number;
    /** Show circle background behind icon (default: true). */
    background?: boolean;
    /** Background fill color (default: semi-transparent dark slate). */
    backgroundColor?: string;
}

/**
 * Convert a React icon component into a `data:image/svg+xml` URL for Cesium billboards.
 * By default wraps the icon in a filled circle for visibility on any terrain.
 * Pass `{ background: false }` to opt out.
 */
export function createSvgIconUrl(
    Icon: ComponentType<any>,
    opts: IconUrlOptions = {},
): string {
    const {
        background = true,
        backgroundColor = DEFAULT_BG_COLOR,
        size = DEFAULT_ICON_SIZE,
        ...iconProps
    } = opts;

    const innerSvg = withSynchronousReactDispatcher(() => (
        renderReactToStaticMarkup(createElement(Icon, { size, ...iconProps }))
    ));

    if (!background) {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(innerSvg)}`;
    }

    // Wrap the icon in a larger SVG with a filled circle behind it
    const padding = 6;
    const totalSize = size + padding * 2;
    const center = totalSize / 2;
    const radius = totalSize / 2 - 1;

    const wrappedSvg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">`,
        `<circle cx="${center}" cy="${center}" r="${radius}" fill="${backgroundColor}" />`,
        `<g transform="translate(${padding}, ${padding})">${innerSvg}</g>`,
        `</svg>`,
    ].join("");

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(wrappedSvg)}`;
}

// ─── Re-export manifest types ─────────────────────────────────
export type { PluginManifest, PluginFormat, PluginType, TrustTier, PluginCapability, DataSourceConfig, FieldMapping, RenderingConfig } from "./manifest";

// ─── Categories ──────────────────────────────────────────────
export type PluginCategory =
    | "aviation"
    | "maritime"
    | "military"
    | "conflict"
    | "natural-disaster"
    | "infrastructure"
    | "space"
    | "cyber"
    | "economic"
    | "weather"
    | "intelligence"
    | "custom";

// ─── Time ────────────────────────────────────────────────────
export interface TimeRange {
    start: Date;
    end: Date;
}

export type TimeWindow = "1h" | "6h" | "24h" | "48h" | "7d";

/**
 * @interface GeoEntity
 * @description The primary data primitive representing a geospatial object.
 */
export interface GeoEntity {
    /** Globally unique identifier for this specific entity instance. */
    id: string;
    /** The ID of the plugin that owns this entity. */
    pluginId: string;
    /** WGS84 Latitude. */
    latitude: number;
    /** WGS84 Longitude. */
    longitude: number;
    /** Altitude in meters above ellipsoid (optional). */
    altitude?: number;
    /** Heading/Rotation in degrees (optional). */
    heading?: number;
    /** Speed in knots or meters/sec depending on domain (optional). */
    speed?: number;
    /** The moment this data was captured. */
    timestamp: Date;
    /** Short display string for labels. */
    label?: string;
    /** Arbitrary metadata associated with the entity. */
    properties: Record<string, unknown>;
}

export interface WsStreamPayload {
    type: "data" | "error";
    pluginId?: string;
    payload?: GeoEntity[];
    error?: string;
}

// ─── Layer Config ────────────────────────────────────────────
export interface LayerConfig {
    color: string;
    iconUrl?: string;
    clusterEnabled: boolean;
    clusterDistance: number;
    minZoomLevel?: number;
    maxEntities?: number;
    /** If true, the core primitive renderer and StackManager will ignore this plugin's entities. Use when getGlobeComponent completely manages rendering. */
    disableDefaultRendering?: boolean;
}

// ─── Cesium Entity Options ───────────────────────────────────
export interface CesiumEntityOptions {
    type: "billboard" | "point" | "polyline" | "polygon" | "label" | "model";
    color?: string;
    size?: number;
    iconUrl?: string;
    rotation?: number;
    outlineColor?: string;
    outlineWidth?: number;
    labelText?: string;
    labelFont?: string;
    distanceDisplayCondition?: { near: number; far: number };
    disableDepthTestDistance?: number;
    /** Billboard scale override (default: 0.6). Plugin devs can set this to control icon size. */
    iconScale?: number;
    /** GPU Depth Test bias (meters). Negative values pull billboard towards camera (default: -1000 for visibility). */
    depthBias?: number;
    modelUrl?: string;
    modelScale?: number;
    modelMinPixelSize?: number;
    modelHeadingOffset?: number;
    trailOptions?: {
        width?: number;
        color?: string;
        dashPattern?: "solid" | "dashed";
        opacityFade?: boolean;
    };
    /** Skip mathematical horizon culling (useful for high-altitude objects like satellites) */
    disableManualHorizonCulling?: boolean;
    /** Skip combining this entity into clusters/stacks when zoomed out */
    disableClustering?: boolean;
}

// ─── Selection Behavior ──────────────────────────────────────
export interface SelectionBehavior {
    showTrail?: boolean;
    trailDurationSec?: number;
    trailStepSec?: number;
    trailColor?: string;
    flyToOffsetMultiplier?: number;
    flyToBaseDistance?: number;
}

// ─── Server Plugin Config ────────────────────────────────────
export interface ServerPluginConfig {
    apiBasePath: string;
    pollingIntervalMs: number;
    requiresAuth?: boolean;
    historyEnabled?: boolean;
    availabilityEnabled?: boolean;
    /** Declares the plugin's primary data transport so the host can avoid incorrect startup fetches. */
    transportMode?: "polling" | "websocket" | "static" | "manual";
    /** Human-readable source label shown in diagnostics. */
    sourceName?: string;
    /** Non-secret source URL or route shown in diagnostics. */
    sourceUrl?: string;
    /** Optional lightweight diagnostics probe metadata. */
    doctor?: {
        enabled?: boolean;
        probePath?: string;
        expectedShape?: "items" | "data" | "geojson" | "array" | "object";
    };
    /** WebSocket URL for direct engine connection. Overrides the global default engine URL. */
    streamUrl?: string;
}

// ─── Plugin Context ──────────────────────────────────────────
// Provided by the host app when initializing each plugin.
// All plugins (built-in and 3rd party) receive the same context.
export interface PluginContext {
    /** 
     * @deprecated Use `getEngineUrl()` instead. This property is statically resolved at registration time.
     */
    apiBaseUrl: string;
    /** 
     * Dynamically resolves the HTTP base URL for the data engine.
     * Evaluates local overrides, manifests, and fallbacks at the moment it is called.
     */
    getEngineUrl: () => string;
    /** 
     * Key-value map of generic environment variables.
     * The engine surfaces any variable starting with NEXT_PUBLIC_WWV_PLUGIN_
     * 
     * WARNING: These are exposed to the client-side browser bundle. 
     * DO NOT USE THIS FOR API KEYS. For sensitive tokens, use getSecret() if provided.
     */
    env: Record<string, string>;
    /** The running edition of the WWV engine */
    edition: "local" | "cloud" | "demo";
    timeRange: TimeRange;
    onDataUpdate: (entities: GeoEntity[]) => void;
    onError: (error: Error) => void;
    /** Get plugin-specific settings from the app config store */
    getPluginSettings: <T = unknown>(pluginId: string) => T | undefined;
    /** Returns true if the app is in timeline playback mode */
    isPlaybackMode: () => boolean;
    /** Returns the current timeline time (relevant in playback mode) */
    getCurrentTime: () => Date;
}

// ─── Filter Definitions ──────────────────────────────────────
export interface FilterSelectOption { value: string; label: string; }
export interface FilterRangeConfig { min: number; max: number; step: number; }
export interface FilterDefinition {
    id: string;
    label: string;
    type: "text" | "select" | "range" | "boolean";
    propertyKey: string;
    options?: FilterSelectOption[];
    range?: FilterRangeConfig;
}

export type FilterValue =
    | { type: "text"; value: string }
    | { type: "select"; values: string[] }
    | { type: "range"; min: number; max: number }
    | { type: "boolean"; value: boolean };

/**
 * @interface WorldPlugin
 * @description The core lifecycle interface for all WorldWideView extensions.
 * Every plugin (built-in or marketplace) must implement this interface.
 */
export interface WorldPlugin {
    id: string;
    name: string;
    description: string;
    icon: string | ComponentType<{ size?: number; color?: string }>;
    category: PluginCategory;
    version: string;

    // Lifecycle
    initialize(ctx: PluginContext): Promise<void>;
    destroy(): void;

    // Data
    fetch(timeRange: TimeRange): Promise<GeoEntity[]>;
    getPollingInterval(): number;

    // Rendering
    getLayerConfig(): LayerConfig;
    renderEntity(entity: GeoEntity): CesiumEntityOptions;

    // Optional
    getSelectionBehavior?(entity: GeoEntity): SelectionBehavior | null;
    getServerConfig?(): ServerPluginConfig;
    getFilterDefinitions?(): FilterDefinition[];
    getLegend?(): { label: string; color: string; filterId?: string; filterValue?: string }[];
    getSidebarComponent?(): ComponentType<{ plugin?: any } | any>;
    getDetailComponent?(): ComponentType<{ entity: GeoEntity }>;
    getSettingsComponent?(): ComponentType<{ pluginId: string }>;
    /** Custom React component injected into the Globe view for rendering primitives/data sources (e.g. GeoJSON). */
    getGlobeComponent?(): ComponentType<{ viewer: any; enabled: boolean }>;
    /**
     * Returns a React component to be rendered inside the Bottom Panel when this plugin's
     * dock button is selected. The panel is resizable and can be expanded to fullscreen.
     * If not provided, the plugin will not appear in the bottom dock.
     */
    getBottomPanelComponent?(): ComponentType<{ pluginId: string; enabled: boolean }>;
    requiresConfiguration?(settings: unknown): boolean;
    /** Map raw websocket payload into GeoEntity array. Optional existingEntities is provided so plugins can merge state (e.g. historical trails). */
    mapWebsocketPayload?(payload: any, existingEntities?: GeoEntity[]): GeoEntity[];
}

// ─── Aliases for backwards compatibility ─────────────────────
export type GlobePlugin = WorldPlugin;

// ─── Data Bus Event Types ────────────────────────────────────
export type DataBusEvents = {
    pluginRegistered: { pluginId: string; defaultInterval: number };
    pluginUnregistered: { pluginId: string };
    dynamicPluginCreate: { plugin: WorldPlugin; autoEnable?: boolean };
    dynamicPluginRemove: { pluginId: string };
    dataUpdated: { pluginId: string; entities: GeoEntity[] };
    entitySelected: { entity: GeoEntity | null };
    layerToggled: { pluginId: string; enabled: boolean };
    timeRangeChanged: { timeRange: TimeRange };
    cameraPreset: { presetId: string };
    cameraFaceTowards: { lat: number; lon: number; alt: number };
    cameraGoTo: { lat: number; lon: number; alt: number; distance?: number; maxPitch?: number; heading?: number; duration?: number };
    globeReady: Record<string, never>;
    pluginError: { pluginId?: string; message: string; error?: Error };
    layerLoadingChanged: { pluginId: string; loading: boolean };
    sourceHealthChanged: {
        pluginId: string;
        patch: {
            status?: "idle" | "loading" | "healthy" | "degraded" | "error" | "stale";
            sourceName?: string;
            sourceUrl?: string;
            sourceType?: "rest" | "ws" | "static" | "composite";
            fallbackActive?: boolean;
            itemCount?: number;
            latencyMs?: number;
            lastAttemptAt?: number;
            lastSuccessAt?: number;
            lastErrorAt?: number;
            lastErrorMessage?: string | null;
            sources?: Array<{
                sourceName: string;
                scope: string;
                ok: boolean;
                count: number;
                errorMessage?: string;
                latencyMs?: number;
            }>;
        };
    };
};

export * from "./viteGlobals";

// ─── Auth Contracts ──────────────────────────────────────────
export * from "./auth-contracts";
