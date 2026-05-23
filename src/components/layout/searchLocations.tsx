import { MapPin } from "lucide-react";
import { categorizePlace } from "./placeCategories";
import type { SearchResult, SearchSection } from "./searchTypes";

function unavailableSection(): SearchSection {
    return {
        title: "Address Lookup",
        icon: <MapPin size={16} />,
        results: [{
            id: "address-lookup-unavailable",
            label: "Address lookup unavailable",
            subLabel: "OpenStreetMap geocoding is temporarily unavailable",
            score: 130,
            lat: 0,
            lon: 0,
            type: "notice",
            resultLabel: "Status",
            disabled: true,
        }],
        maxScore: 130,
    };
}

export async function searchLocations(query: string): Promise<SearchSection | null> {
    try {
        const res = await fetch(`/api/places/search?input=${encodeURIComponent(query)}`);
        if (!res.ok) return unavailableSection();
        const data = await res.json();
        if (!data.predictions?.length) return null;

        const results: SearchResult[] = data.predictions.map(
            (p: { placeId: string; mainText: string; secondaryText: string; types?: string[]; provider?: string }, i: number) => {
                const category = categorizePlace(p.types || []);
                const isAddress = category === "address";
                const source = p.provider || "OpenStreetMap";
                const sourceLabel = p.secondaryText ? `${p.secondaryText} · ${source}` : source;
                return {
                    id: p.placeId,
                    label: p.mainText,
                    subLabel: sourceLabel,
                    score: (isAddress ? 155 : 120) - i,
                    lat: 0,
                    lon: 0,
                    type: isAddress ? "address" as const : category === "region" ? "country" as const : "place" as const,
                    resultLabel: isAddress ? "Address" : "Place",
                    placeCategory: category,
                };
            }
        );

        return {
            title: results.some((result) => result.type === "address") ? "Address Lookup" : "Places",
            icon: <MapPin size={16} />,
            results: results.slice(0, 5),
            maxScore: results[0].score,
        };
    } catch (err) {
        console.error("Error fetching places:", err);
        return unavailableSection();
    }
}
