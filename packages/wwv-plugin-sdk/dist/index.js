"use strict";
/**
 * @file index.ts
 * @description Core SDK for WorldWideView plugin development.
 * Defines the foundational types, interfaces, and utilities required
 * to build data seeders, visualizers, and UI extensions.
 * @module @worldwideview/wwv-plugin-sdk
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ICON_SIZE = void 0;
exports.createSvgIconUrl = createSvgIconUrl;
const react_1 = __importDefault(require("react"));
const React = __importStar(require("react"));
const react_2 = require("react");
/** Standard SVG icon size (px) used by createSvgIconUrl when no size is given. */
exports.DEFAULT_ICON_SIZE = 32;
/** Default dark background color for icon circles. */
const DEFAULT_BG_COLOR = "rgba(15, 23, 42, 0.85)";
const REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
const REACT_MEMO_TYPE = Symbol.for("react.memo");
const CASE_SENSITIVE_SVG_ATTRIBUTES = new Set(["viewBox"]);
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function toKebabCase(value) {
    return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
function styleObjectToString(style) {
    return Object.entries(style)
        .map(([key, value]) => `${toKebabCase(key)}:${String(value)}`)
        .join(";");
}
function renderAttributes(props) {
    const attributes = [];
    for (const [rawKey, rawValue] of Object.entries(props)) {
        if (rawKey === "children" ||
            rawKey === "ref" ||
            rawKey === "key" ||
            rawValue === undefined ||
            rawValue === null ||
            rawValue === false ||
            typeof rawValue === "function") {
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
            ? styleObjectToString(rawValue)
            : String(rawValue);
        attributes.push(`${key}="${escapeHtml(value)}"`);
    }
    return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
}
function resolveComponentElement(element) {
    var _a, _b, _c;
    const { type, props } = element;
    if (type === react_2.Fragment) {
        return props.children;
    }
    if (typeof type === "function") {
        return type(props);
    }
    if (typeof type === "object" && type !== null) {
        const component = type;
        if (component.$$typeof === REACT_FORWARD_REF_TYPE && typeof component.render === "function") {
            const renderSource = String(component.render);
            if (renderSource.includes("iconNode") && renderSource.includes("lucide-")) {
                const iconProps = props;
                const size = (_a = iconProps.size) !== null && _a !== void 0 ? _a : exports.DEFAULT_ICON_SIZE;
                const stroke = (_c = (_b = iconProps.color) !== null && _b !== void 0 ? _b : iconProps.stroke) !== null && _c !== void 0 ? _c : "currentColor";
                return (0, react_2.createElement)("svg", {
                    xmlns: "http://www.w3.org/2000/svg",
                    width: size,
                    height: size,
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke,
                    strokeWidth: 2,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                }, (0, react_2.createElement)("circle", { cx: 12, cy: 12, r: 3 }), (0, react_2.createElement)("path", { d: "M12 2v20" }), (0, react_2.createElement)("path", { d: "M2 12h20" }));
            }
            return component.render(props, null);
        }
        if (component.$$typeof === REACT_MEMO_TYPE && component.type) {
            return (0, react_2.createElement)(component.type, props);
        }
    }
    return null;
}
function renderReactToStaticMarkup(node) {
    if (node === null || node === undefined || typeof node === "boolean")
        return "";
    if (typeof node === "string" || typeof node === "number")
        return escapeHtml(String(node));
    if (Array.isArray(node))
        return node.map(renderReactToStaticMarkup).join("");
    if (!(0, react_2.isValidElement)(node)) {
        return react_2.Children.toArray(node).map(renderReactToStaticMarkup).join("");
    }
    if (typeof node.type !== "string") {
        return renderReactToStaticMarkup(resolveComponentElement(node));
    }
    const props = node.props;
    const children = renderReactToStaticMarkup(props.children);
    return `<${node.type}${renderAttributes(props)}>${children}</${node.type}>`;
}
function withSynchronousReactDispatcher(render) {
    const reactModules = [React, react_1.default];
    const react19Internals = reactModules
        .map((reactModule) => reactModule.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE)
        .filter((value) => Boolean(value));
    const react18Dispatchers = reactModules
        .map((reactModule) => {
        var _a;
        return (_a = reactModule.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) === null || _a === void 0 ? void 0 : _a.ReactCurrentDispatcher;
    })
        .filter((value) => Boolean(value));
    const previousReact19Dispatchers = react19Internals.map((reactInternal) => reactInternal.H);
    const previousReact18Dispatchers = react18Dispatchers.map((reactDispatcher) => reactDispatcher.current);
    const dispatcher = {
        useContext: (context) => {
            var _a, _b;
            const values = context;
            return (_b = (_a = values === null || values === void 0 ? void 0 : values._currentValue) !== null && _a !== void 0 ? _a : values === null || values === void 0 ? void 0 : values._currentValue2) !== null && _b !== void 0 ? _b : null;
        },
        useMemo: (factory) => factory(),
        useCallback: (callback) => callback,
        useRef: (value) => ({ current: value }),
        useState: (value) => [
            typeof value === "function" ? value() : value,
            () => { },
        ],
        useId: () => "",
    };
    try {
        react19Internals.forEach((reactInternal) => { reactInternal.H = dispatcher; });
        react18Dispatchers.forEach((reactDispatcher) => { reactDispatcher.current = dispatcher; });
        return render();
    }
    finally {
        react19Internals.forEach((reactInternal, index) => {
            reactInternal.H = previousReact19Dispatchers[index];
        });
        react18Dispatchers.forEach((reactDispatcher, index) => {
            reactDispatcher.current = previousReact18Dispatchers[index];
        });
    }
}
/**
 * Convert a React icon component into a `data:image/svg+xml` URL for Cesium billboards.
 * By default wraps the icon in a filled circle for visibility on any terrain.
 * Pass `{ background: false }` to opt out.
 */
function createSvgIconUrl(Icon, opts = {}) {
    const { background = true, backgroundColor = DEFAULT_BG_COLOR, size = exports.DEFAULT_ICON_SIZE } = opts, iconProps = __rest(opts, ["background", "backgroundColor", "size"]);
    const innerSvg = withSynchronousReactDispatcher(() => (renderReactToStaticMarkup((0, react_2.createElement)(Icon, Object.assign({ size }, iconProps)))));
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
__exportStar(require("./viteGlobals"), exports);
// ─── Auth Contracts ──────────────────────────────────────────
__exportStar(require("./auth-contracts"), exports);
