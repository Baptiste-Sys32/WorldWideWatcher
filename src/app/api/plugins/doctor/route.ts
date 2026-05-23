import { NextRequest, NextResponse } from "next/server";
import { safeFetch } from "@/lib/security/ssrf";

const MAX_PROBE_BYTES = 256 * 1024;

/**
 * Summarizes the top-level shape of a JSON payload for diagnostics.
 *
 * @param value - Parsed JSON payload from an upstream probe.
 * @returns A short label describing the response shape.
 */
function summarizeShape(value: unknown): string {
    if (Array.isArray(value)) return "array";
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (Array.isArray(record.items)) return "items";
        if (Array.isArray(record.data)) return "data";
        if (record.type === "FeatureCollection") return "geojson";
        return "object";
    }
    return typeof value;
}

/**
 * Probes an upstream URL and returns sanitized diagnostics without body content.
 *
 * @param request - Next.js request containing the probe URL.
 * @returns A JSON response describing probe status, timing, and content shape.
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const responseMs = () => Math.max(0, Date.now() - startedAt);
    try {
        const body = await request.json().catch(() => ({}));
        const url = typeof body.url === "string" ? body.url : "";
        if (!url) {
            return NextResponse.json({
                ok: false,
                status: 400,
                contentType: "application/json",
                shape: "unknown",
                responseMs: responseMs(),
                error: "Missing url",
            }, { status: 400 });
        }

        const upstream = await safeFetch(url, {
            method: "GET",
            timeout: 5_000,
            maxSize: MAX_PROBE_BYTES,
            headers: {
                Accept: "application/json,application/geo+json,text/plain;q=0.4,*/*;q=0.1",
                "User-Agent": "WorldWideView Plugin Doctor",
            },
        });

        const contentType = upstream.headers.get("content-type") ?? "";
        let shape = "unknown";
        if (contentType.includes("json")) {
            const data = await upstream.json().catch(() => null);
            shape = summarizeShape(data);
        } else {
            shape = contentType || "non-json";
            await upstream.arrayBuffer().catch(() => null);
        }

        return NextResponse.json({
            ok: upstream.ok,
            status: upstream.status,
            contentType,
            shape,
            responseMs: responseMs(),
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Probe failed";
        return NextResponse.json({
            ok: false,
            status: 502,
            contentType: "application/json",
            shape: "unknown",
            responseMs: responseMs(),
            error: message.includes("SSRF") ? message : "Probe failed",
        }, { status: 502 });
    }
}
