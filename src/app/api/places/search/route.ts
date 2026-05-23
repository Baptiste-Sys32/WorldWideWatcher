import { NextResponse } from "next/server";
import { getNominatimEndpoint } from "@/lib/places/nominatim";

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL_MS = 60 * 60 * 1000;
const MIN_QUERY_LENGTH = 3;

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

function mainText(item: Record<string, unknown>): string {
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : null;
    const displayName = typeof item.display_name === "string" ? item.display_name : "";
    return name ?? displayName.split(",")[0]?.trim() ?? displayName;
}

function secondaryText(item: Record<string, unknown>): string {
    const displayName = typeof item.display_name === "string" ? item.display_name : "";
    const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
    return parts.slice(1).join(", ");
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const input = searchParams.get("input")?.trim();

    if (!input) {
        return NextResponse.json({ error: "Input is required" }, { status: 400 });
    }
    if (input.length < MIN_QUERY_LENGTH) {
        return NextResponse.json({ predictions: [] });
    }

    const cacheKey = input.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        return NextResponse.json(cached.data);
    }

    const params = new URLSearchParams({
        q: input,
        format: "jsonv2",
        addressdetails: "1",
        namedetails: "1",
        limit: "6",
    });

    try {
        const response = await fetch(`${getNominatimEndpoint("search")}?${params.toString()}`, {
            headers: {
                Accept: "application/json",
                "User-Agent": "WorldWideView/2.16 address-search",
                Referer: "https://worldwideview.dev",
            },
            next: { revalidate: 3600 },
        });

        if (!response.ok) {
            return NextResponse.json({ error: "Failed to fetch address predictions" }, { status: 502 });
        }

        const data = await response.json();
        const predictions = (Array.isArray(data) ? data : []).map((item: Record<string, unknown>) => ({
            description: item.display_name,
            placeId: `osm:${item.osm_type}:${item.osm_id}`,
            mainText: mainText(item),
            secondaryText: secondaryText(item),
            types: classifyNominatimType(item),
            provider: "OpenStreetMap",
            lat: Number(item.lat),
            lon: Number(item.lon),
            boundingbox: item.boundingbox,
        }));

        const result = { predictions };
        cache.set(cacheKey, { data: result, expiresAt: Date.now() + TTL_MS });
        return NextResponse.json(result);
    } catch (error) {
        console.error("Error in OSM Places search route:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
