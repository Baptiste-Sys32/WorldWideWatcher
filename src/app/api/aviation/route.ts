import { NextResponse } from "next/server";

type OpenSkyState = [
    string,
    string | null,
    string,
    number | null,
    number,
    number | null,
    number | null,
    number | null,
    boolean,
    number | null,
    number | null,
    number | null,
    number[] | null,
    number | null,
    string | null,
    boolean,
    number,
    number?
];

interface AviationItem {
    icao24: string;
    callsign: string;
    origin_country: string;
    lat: number;
    lon: number;
    alt: number;
    hdg: number | null;
    spd: number | null;
    vertical_rate: number | null;
    on_ground: boolean;
    squawk: string | null;
    time_position: number | null;
    last_contact: number;
}

interface AviationResponse {
    items: AviationItem[];
    sourceTime: number | null;
    source: "opensky";
    sourceMode: "opensky-fallback";
    sources: Array<{
        sourceName: string;
        scope: string;
        ok: boolean;
        count: number;
        latencyMs: number;
        errorMessage?: string;
    }>;
    error?: string;
}

let cache: { at: number; payload: AviationResponse } | null = null;

const CACHE_MS = 10_000;
const MAX_AIRCRAFT = 5_000;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function toItem(state: OpenSkyState): AviationItem | null {
    const [
        icao24,
        rawCallsign,
        originCountry,
        timePosition,
        lastContact,
        longitude,
        latitude,
        baroAltitude,
        onGround,
        velocity,
        trueTrack,
        verticalRate,
        ,
        geoAltitude,
        squawk,
    ] = state;

    if (!icao24 || !isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return null;

    const altitude = isFiniteNumber(geoAltitude)
        ? geoAltitude
        : isFiniteNumber(baroAltitude)
            ? baroAltitude
            : 0;

    return {
        icao24,
        callsign: rawCallsign?.trim() || icao24,
        origin_country: originCountry,
        lat: latitude,
        lon: longitude,
        alt: altitude,
        hdg: isFiniteNumber(trueTrack) ? trueTrack : null,
        spd: isFiniteNumber(velocity) ? velocity : null,
        vertical_rate: isFiniteNumber(verticalRate) ? verticalRate : null,
        on_ground: onGround,
        squawk,
        time_position: timePosition,
        last_contact: lastContact,
    };
}

function degradedResponse(started: number, error: string) {
    return NextResponse.json({
        items: cache?.payload.items ?? [],
        sourceTime: cache?.payload.sourceTime ?? null,
        source: "opensky",
        sourceMode: "opensky-fallback",
        error,
        sources: [{
            sourceName: "OpenSky fallback",
            scope: "global",
            ok: false,
            count: cache?.payload.items.length ?? 0,
            latencyMs: Math.max(0, Date.now() - started),
            errorMessage: error,
        }],
    } satisfies AviationResponse);
}

export async function GET() {
    if (cache && Date.now() - cache.at < CACHE_MS) {
        return NextResponse.json(cache.payload);
    }

    const started = Date.now();
    let res: Response;
    try {
        res = await fetch("https://opensky-network.org/api/states/all", {
            headers: {
                Accept: "application/json",
                "User-Agent": "WorldWideView Local Aviation Fallback",
            },
            next: { revalidate: 0 },
        });
    } catch (err) {
        return degradedResponse(
            started,
            err instanceof Error ? err.message : "OpenSky request failed",
        );
    }

    if (!res.ok) {
        const error = `OpenSky returned HTTP ${res.status}`;
        return degradedResponse(started, error);
    }

    let data: { time?: number; states?: OpenSkyState[] | null };
    try {
        data = await res.json() as { time?: number; states?: OpenSkyState[] | null };
    } catch (err) {
        return degradedResponse(
            started,
            err instanceof Error ? err.message : "OpenSky returned invalid JSON",
        );
    }
    const states = Array.isArray(data.states) ? data.states : [];
    const items = states
        .map(toItem)
        .filter((item): item is AviationItem => item !== null)
        .slice(0, MAX_AIRCRAFT);

    const payload = {
        items,
        sourceTime: data.time ?? null,
        source: "opensky" as const,
        sourceMode: "opensky-fallback" as const,
        sources: [{
            sourceName: "OpenSky fallback",
            scope: "global",
            ok: true,
            count: items.length,
            latencyMs: Math.max(0, Date.now() - started),
        }],
    } satisfies AviationResponse;
    cache = { at: Date.now(), payload };

    return NextResponse.json(payload);
}
