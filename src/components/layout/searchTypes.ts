import type { GeoEntity } from "@/core/plugins/PluginTypes";
import type { PlaceCategory } from "./placeCategories";

export interface SearchResult {
    id: string;
    label: string;
    subLabel?: string;
    score: number;
    lat: number;
    lon: number;
    type: "country" | "entity" | "place" | "address" | "layer" | "plugin" | "command" | "doctor" | "notice";
    resultLabel?: string;
    disabled?: boolean;
    pluginId?: string;
    entity?: GeoEntity;
    placeCategory?: PlaceCategory;
    action?: () => void | Promise<void>;
}

export interface SearchSection {
    title: string;
    icon: React.ReactNode;
    results: SearchResult[];
    maxScore: number;
}
