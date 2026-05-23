/**
 * @file nominatim.ts
 * @description Shared helpers for resolving the Nominatim base URL.
 */

const DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

/**
 * Normalizes the configured Nominatim base URL.
 *
 * @param raw - Environment-provided base URL string.
 * @returns A normalized base URL without trailing path segments.
 */
function normalizeNominatimBaseUrl(raw?: string): string {
    if (!raw) return DEFAULT_NOMINATIM_BASE_URL;
    const trimmed = raw.trim();
    if (!trimmed) return DEFAULT_NOMINATIM_BASE_URL;
    const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
    const withoutEndpoint = withoutTrailingSlash.replace(/\/(search|lookup)$/i, "");
    return withoutEndpoint || DEFAULT_NOMINATIM_BASE_URL;
}

/**
 * Builds a Nominatim endpoint URL for the given route.
 *
 * @param endpoint - Nominatim endpoint ("search" or "lookup").
 * @returns Fully qualified URL for the endpoint.
 */
export function getNominatimEndpoint(endpoint: "search" | "lookup"): string {
    const base = normalizeNominatimBaseUrl(process.env.NOMINATIM_BASE_URL);
    return `${base}/${endpoint}`;
}
