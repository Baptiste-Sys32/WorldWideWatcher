import type { GeoEntity } from "@/core/plugins/PluginTypes";

export function normalizeAviationEntities(pluginId: string, entities: GeoEntity[]): GeoEntity[] {
    if (pluginId !== "aviation") return entities;

    return entities.map((entity) => {
        const altitudeMeters = entity.properties?.altitude_m;
        if (typeof altitudeMeters !== "number" || !Number.isFinite(altitudeMeters)) {
            return entity;
        }

        return {
            ...entity,
            altitude: altitudeMeters,
        };
    });
}
