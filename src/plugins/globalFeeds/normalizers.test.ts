import { describe, expect, it } from "vitest";
import {
    mergeAndDedupeEntities,
    normalizeGdacsEvents,
    normalizeMeteoFranceAlerts,
} from "./normalizers";
import type { FeedEntity } from "./types";

function entity(overrides: Partial<FeedEntity>): FeedEntity {
    const {
        properties,
        ...rest
    } = overrides;
    return {
        id: "e",
        pluginId: "flood-alerts",
        latitude: 0,
        longitude: 0,
        timestamp: new Date("2026-05-22T00:00:00.000Z"),
        ...rest,
        properties: {
            sourceScope: "global",
            sourceName: "test",
            eventType: "flood",
            ...properties,
        },
    };
}

describe("global feed normalizers", () => {
    it("filters France GDACS events when country metadata identifies France", () => {
        const items = normalizeGdacsEvents("flood-alerts", {
            features: [
                {
                    id: "fr-1",
                    geometry: { type: "Point", coordinates: [2.2, 46.2] },
                    properties: { country: "France", eventname: "Flood France" },
                },
                {
                    id: "it-1",
                    geometry: { type: "Point", coordinates: [12.4, 41.9] },
                    properties: { country: "Italy", eventname: "Flood Italy" },
                },
            ],
        }, "flood");

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            pluginId: "flood-alerts",
            properties: { sourceScope: "global", sourceName: "GDACS", country: "Italy" },
        });
    });

    it("dedupes global France-adjacent events when a France item is equivalent", () => {
        const global = [
            entity({
                id: "global-fr",
                latitude: 46.23,
                longitude: 2.21,
                properties: { sourceScope: "global", sourceName: "GDACS", eventType: "flood" },
            }),
            entity({
                id: "global-it",
                latitude: 41.9,
                longitude: 12.5,
                properties: { sourceScope: "global", sourceName: "GDACS", eventType: "flood", country: "Italy" },
            }),
        ];
        const france = [
            entity({
                id: "france",
                latitude: 46.24,
                longitude: 2.2,
                properties: { sourceScope: "france", sourceName: "Vigicrues", eventType: "flood", country: "France" },
            }),
        ];

        const merged = mergeAndDedupeEntities(global, france);

        expect(merged.map((item) => item.id)).toEqual(["global-it", "france"]);
    });

    it("normalizes Meteo-France items under the parent tropical cyclones plugin", () => {
        const items = normalizeMeteoFranceAlerts([
            {
                id: "gp",
                lat: 16.25,
                lon: -61.58,
                phenomenon: "cyclone",
                level: "orange",
            },
        ]);

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            pluginId: "tropical-cyclones",
            latitude: 16.25,
            longitude: -61.58,
            properties: {
                sourceScope: "france",
                sourceName: "Meteo-France",
                eventType: "tropical-cyclone",
            },
        });
    });
});
