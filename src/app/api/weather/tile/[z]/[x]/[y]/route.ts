import { NextRequest, NextResponse } from "next/server";

export const revalidate = 900;

const TILE_SIZE = 256;
const DEFAULT_GRID_SIZE = 4;
const TEMPERATURE_GRID_SIZE = 8;

const LAYER_CONFIG = {
    "weather-temperature": {
        variable: "temperature_2m",
        openWeatherMapLayer: "temp_new",
        label: "Temperature",
    },
    "weather-precipitation": {
        variable: "precipitation",
        openWeatherMapLayer: "precipitation_new",
        label: "Precipitation",
    },
    "weather-clouds": {
        variable: "cloud_cover",
        openWeatherMapLayer: "clouds_new",
        label: "Cloud cover",
    },
    "weather-wind": {
        variable: "wind_speed_10m,wind_direction_10m",
        openWeatherMapLayer: "wind_new",
        label: "Wind",
    },
} as const;

type WeatherLayer = keyof typeof LAYER_CONFIG;

interface RainViewerFrame {
    time?: number;
    path?: string;
}

interface RainViewerManifest {
    host?: string;
    radar?: {
        past?: RainViewerFrame[];
        nowcast?: RainViewerFrame[];
    };
}

function isValidLayer(layer: string): layer is WeatherLayer {
    return layer in LAYER_CONFIG;
}

function isValidTileCoord(value: string): boolean {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0;
}

function tile2lon(x: number, z: number): number {
    return (x / 2 ** z) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
    const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function colorFor(layer: WeatherLayer, value: number): string {
    if (layer === "weather-temperature") {
        if (value <= -25) return "#08306b";
        if (value <= -15) return "#2171b5";
        if (value <= -5) return "#6baed6";
        if (value <= 5) return "#d7eff5";
        if (value <= 15) return "#fff7bc";
        if (value <= 25) return "#fec44f";
        if (value <= 35) return "#f03b20";
        return "#99000d";
    }
    if (layer === "weather-precipitation") {
        if (value <= 0.05) return "rgba(0, 0, 0, 0)";
        if (value <= 0.25) return "rgba(39, 174, 96, 0.68)";
        if (value <= 1) return "rgba(30, 190, 72, 0.82)";
        if (value <= 3) return "rgba(252, 211, 77, 0.9)";
        if (value <= 8) return "rgba(249, 115, 22, 0.95)";
        return "rgba(220, 38, 38, 0.98)";
    }
    if (layer === "weather-clouds") {
        const alpha = Math.max(0.12, Math.min(0.62, value / 135));
        return `rgba(226, 232, 240, ${alpha.toFixed(2)})`;
    }
    if (value <= 2) return "rgba(125, 211, 252, 0.28)";
    if (value <= 8) return "rgba(45, 212, 191, 0.42)";
    if (value <= 15) return "rgba(250, 204, 21, 0.5)";
    return "rgba(248, 113, 113, 0.58)";
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [value];
}

function numericAt(values: unknown[], index: number): number {
    const value = values[index] ?? values[0];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function gridSizeFor(layer: WeatherLayer): number {
    return layer === "weather-temperature" ? TEMPERATURE_GRID_SIZE : DEFAULT_GRID_SIZE;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function buildOpenMeteoUrl(layer: WeatherLayer, latitudes: number[], longitudes: number[]): string {
    const params = new URLSearchParams({
        latitude: latitudes.map((lat) => lat.toFixed(3)).join(","),
        longitude: longitudes.map((lon) => lon.toFixed(3)).join(","),
        current: LAYER_CONFIG[layer].variable,
        temperature_unit: "celsius",
        wind_speed_unit: "kmh",
    });
    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function buildOpenWeatherMapTileUrl(layer: WeatherLayer, z: string, x: string, y: string, apiKey: string): string {
    const params = new URLSearchParams({ appid: apiKey });
    return `https://tile.openweathermap.org/map/${LAYER_CONFIG[layer].openWeatherMapLayer}/${z}/${x}/${y}.png?${params.toString()}`;
}

async function buildRainViewerTileUrl(z: string, x: string, y: string): Promise<string> {
    const manifestResponse = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
        headers: { "User-Agent": "WorldWideView/1.0" },
        next: { revalidate: 300 },
    });

    if (!manifestResponse.ok) {
        throw new Error(`RainViewer manifest returned ${manifestResponse.status}`);
    }

    const manifest = await manifestResponse.json() as RainViewerManifest;
    const frames = [
        ...(manifest.radar?.nowcast ?? []),
        ...(manifest.radar?.past ?? []),
    ].filter((frame): frame is Required<RainViewerFrame> => typeof frame.path === "string" && typeof frame.time === "number");
    const frame = frames.sort((a, b) => b.time - a.time)[0];

    if (!manifest.host || !frame) {
        throw new Error("RainViewer manifest did not include radar frames");
    }

    return `${manifest.host}${frame.path}/256/${z}/${x}/${y}/2/1_1.png`;
}

function buildSvg(layer: WeatherLayer, values: number[], windDirections: number[] = []): string {
    const gridSize = gridSizeFor(layer);
    const cell = TILE_SIZE / gridSize;
    const rects: string[] = [];
    const arrows: string[] = [];
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const index = row * gridSize + col;
            const value = values[index] ?? 0;
            const pad = layer === "weather-temperature" ? 5 : 1;
            rects.push(`<rect x="${(col * cell - pad).toFixed(1)}" y="${(row * cell - pad).toFixed(1)}" width="${(cell + pad * 2).toFixed(1)}" height="${(cell + pad * 2).toFixed(1)}" fill="${colorFor(layer, value)}"/>`);
            if (layer === "weather-wind") {
                const cx = col * cell + cell / 2;
                const cy = row * cell + cell / 2;
                const length = Math.max(10, Math.min(28, value * 1.4));
                const rotation = windDirections[index] ?? 0;
                arrows.push(`<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rotation.toFixed(0)})"><line x1="0" y1="${(length / 2).toFixed(1)}" x2="0" y2="${(-length / 2).toFixed(1)}" stroke="rgba(255,255,255,0.76)" stroke-width="2.2" stroke-linecap="round"/><path d="M -5 -${(length / 2 - 4).toFixed(1)} L 0 -${(length / 2 + 4).toFixed(1)} L 5 -${(length / 2 - 4).toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.76)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`);
            }
        }
    }
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}">`,
        layer === "weather-temperature" ? `<defs><filter id="temperature-smooth" x="-12%" y="-12%" width="124%" height="124%"><feGaussianBlur stdDeviation="5"/></filter></defs>` : "",
        `<rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${layer === "weather-temperature" ? "#fff7bc" : "rgba(0,0,0,0)"}"/>`,
        layer === "weather-temperature" ? `<g filter="url(#temperature-smooth)">` : "",
        ...rects,
        layer === "weather-temperature" ? "</g>" : "",
        ...arrows,
        `<text x="8" y="248" fill="rgba(255,255,255,0.82)" font-family="monospace" font-size="10">${escapeXml(LAYER_CONFIG[layer].label)} - Open-Meteo</text>`,
        "</svg>",
    ].join("");
}

async function fetchOpenMeteoTile(layer: WeatherLayer, zoom: number, tileX: number, tileY: number): Promise<Response> {
    const gridSize = gridSizeFor(layer);
    const latitudes: number[] = [];
    const longitudes: number[] = [];
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            longitudes.push(tile2lon(tileX + (col + 0.5) / gridSize, zoom));
            latitudes.push(tile2lat(tileY + (row + 0.5) / gridSize, zoom));
        }
    }

    const response = await fetch(buildOpenMeteoUrl(layer, latitudes, longitudes), {
        headers: { "User-Agent": "WorldWideView/1.0" },
        next: { revalidate },
    });

    if (!response.ok) {
        throw new Error(`Open-Meteo returned ${response.status}`);
    }

    const body = await response.json();
    const current = body?.current;
    const valueKey = layer === "weather-wind" ? "wind_speed_10m" : LAYER_CONFIG[layer].variable;
    const values = asArray(current?.[valueKey]).map((value, index, array) => numericAt(array, index));
    const directions = asArray(current?.wind_direction_10m).map((value, index, array) => numericAt(array, index));
    const svg = buildSvg(layer, values, directions);

    return new Response(svg, {
        status: 200,
        headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=900, stale-while-revalidate=900",
        },
    });
}

async function fetchOpenWeatherMapTile(layer: WeatherLayer, z: string, x: string, y: string, apiKey: string): Promise<Response> {
    const response = await fetch(buildOpenWeatherMapTileUrl(layer, z, x, y, apiKey), {
        headers: { "User-Agent": "WorldWideView/1.0" },
        next: { revalidate },
    });

    if (!response.ok) {
        throw new Error(`OpenWeatherMap returned ${response.status}`);
    }

    const image = await response.arrayBuffer();
    return new Response(image, {
        status: 200,
        headers: {
            "Content-Type": response.headers.get("Content-Type") || "image/png",
            "Cache-Control": "public, max-age=900, stale-while-revalidate=900",
        },
    });
}

async function fetchRainViewerTile(z: string, x: string, y: string): Promise<Response> {
    const response = await fetch(await buildRainViewerTileUrl(z, x, y), {
        headers: { "User-Agent": "WorldWideView/1.0" },
        next: { revalidate: 300 },
    });

    if (!response.ok) {
        throw new Error(`RainViewer tile returned ${response.status}`);
    }

    const image = await response.arrayBuffer();
    return new Response(image, {
        status: 200,
        headers: {
            "Content-Type": response.headers.get("Content-Type") || "image/png",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=300",
        },
    });
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
    const { z, x, y } = await params;
    const layer = req.nextUrl.searchParams.get("layer");

    if (!layer || !isValidLayer(layer)) {
        return NextResponse.json(
            { error: `Invalid layer. Must be one of: ${Object.keys(LAYER_CONFIG).join(", ")}` },
            { status: 400 },
        );
    }

    if (!isValidTileCoord(z) || !isValidTileCoord(x) || !isValidTileCoord(y)) {
        return NextResponse.json({ error: "Invalid tile coordinates" }, { status: 400 });
    }

    const zoom = Number(z);
    const tileX = Number(x);
    const tileY = Number(y);
    if (tileX >= 2 ** zoom || tileY >= 2 ** zoom) {
        return NextResponse.json({ error: "Tile coordinates outside zoom range" }, { status: 400 });
    }

    const openWeatherMapApiKey = process.env.OPENWEATHERMAP_API_KEY?.trim();

    try {
        if (layer === "weather-precipitation") {
            try {
                return await fetchRainViewerTile(z, x, y);
            } catch (error) {
                console.warn("[WeatherTile] RainViewer failed, falling back to Open-Meteo:", error);
            }
        }

        if (openWeatherMapApiKey && layer !== "weather-precipitation") {
            try {
                return await fetchOpenWeatherMapTile(layer, z, x, y, openWeatherMapApiKey);
            } catch (error) {
                console.warn("[WeatherTile] OpenWeatherMap failed, falling back to Open-Meteo:", error);
            }
        }

        return await fetchOpenMeteoTile(layer, zoom, tileX, tileY);
    } catch (error) {
        console.error("[WeatherTile] Error:", error);
        return NextResponse.json({ error: "Failed to fetch weather data" }, { status: 502 });
    }
}
