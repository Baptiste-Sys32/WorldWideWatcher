import { NextResponse } from "next/server";
import { getNominatimEndpoint } from "@/lib/places/nominatim";

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

function osmIdFromPlaceId(placeId: string): string | null {
    const match = placeId.match(/^osm:(node|way|relation):(\d+)$/);
    if (!match) return null;
    const prefix = match[1] === "node" ? "N" : match[1] === "way" ? "W" : "R";
    return `${prefix}${match[2]}`;
}

function viewportFromBoundingBox(boundingbox: unknown) {
    if (!Array.isArray(boundingbox) || boundingbox.length < 4) return null;
    const [south, north, west, east] = boundingbox.map(Number);
    if (![south, north, west, east].every(Number.isFinite)) return null;
    return {
        northeast: { lat: north, lng: east },
        southwest: { lat: south, lng: west },
    };
}

function classifyNominatimType(item: Record<string, unknown>): string[] {
    const category = String(item.category ?? "");
    const type = String(item.type ?? "");
    const addressType = String(item.addresstype ?? "");
    if (["house", "building", "place"].includes(category) && ["house", "residential", "yes"].includes(type)) {
        return ["street_address"];
    }
    if (["road", "highway"].includes(category) || addressType === "road") return ["route"];
    if (["city", "town", "village", "municipality"].includes(type) || addressType === "city") return ["locality", "political"];
    if (addressType === "country" || type === "country") return ["country", "political"];
    if (category === "amenity" || category === "tourism" || category === "shop") return ["establishment", "point_of_interest"];
    return ["geocode"];
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get("place_id");

    if (!placeId) {
        return NextResponse.json({ error: "place_id is required" }, { status: 400 });
    }

    const osmIds = osmIdFromPlaceId(placeId);
    if (!osmIds) {
        return NextResponse.json({ error: "Unsupported place_id" }, { status: 400 });
    }

    const cached = cache.get(placeId);
    if (cached && Date.now() < cached.expiresAt) {
        return NextResponse.json(cached.data);
    }

    const params = new URLSearchParams({
        osm_ids: osmIds,
        format: "jsonv2",
        addressdetails: "1",
    });

    try {
        const response = await fetch(`${getNominatimEndpoint("lookup")}?${params.toString()}`, {
            headers: {
                Accept: "application/json",
                "User-Agent": "WorldWideView/2.16 address-lookup",
                Referer: "https://worldwideview.dev",
            },
            next: { revalidate: 86400 },
        });

        if (!response.ok) {
            return NextResponse.json({ error: "Failed to fetch place details" }, { status: 502 });
        }

        const data = await response.json();
        const item = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
        if (!item) {
            return NextResponse.json({ error: "No geometry found for place" }, { status: 404 });
        }

        const lat = Number(item.lat);
        const lon = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return NextResponse.json({ error: "No geometry found for place" }, { status: 404 });
        }

        const result = {
            lat,
            lon,
            name: typeof item.name === "string" ? item.name : String(item.display_name ?? "Address"),
            formattedAddress: item.display_name,
            types: classifyNominatimType(item),
            viewport: viewportFromBoundingBox(item.boundingbox),
            provider: "OpenStreetMap",
        };
        cache.set(placeId, { data: result, expiresAt: Date.now() + TTL_MS });
        return NextResponse.json(result);
    } catch (error) {
        console.error("Error in OSM Places details route:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
