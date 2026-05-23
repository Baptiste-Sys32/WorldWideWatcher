import type { GeoEntity, TimeRange } from "@/core/plugins/PluginTypes";

export interface TimelineFilterOptions {
    playbackMode: boolean;
    timeRange: TimeRange;
    strictUntimed?: boolean;
}

export interface TimelineFilterCounts {
    visible: number;
    hiddenByTime: number;
    untimed: number;
}

function entityTimeMs(entity: GeoEntity): number | null {
    const raw = entity.timestamp ?? entity.properties?.timestamp ?? entity.properties?.date ?? entity.properties?.time;
    const date = raw instanceof Date ? raw : new Date(String(raw));
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function isEntityVisibleInTimeline(entity: GeoEntity, options: TimelineFilterOptions): boolean {
    if (!options.playbackMode) return true;
    const ms = entityTimeMs(entity);
    if (ms === null) return !options.strictUntimed;
    return ms >= options.timeRange.start.getTime() && ms <= options.timeRange.end.getTime();
}

export function filterEntitiesForTimeline<T extends { entity: GeoEntity }>(
    items: T[],
    options: TimelineFilterOptions,
): T[] {
    if (!options.playbackMode) return items;
    return items.filter((item) => isEntityVisibleInTimeline(item.entity, options));
}

export function countTimelineFilteredEntities(
    entities: GeoEntity[],
    options: TimelineFilterOptions,
): TimelineFilterCounts {
    if (!options.playbackMode) {
        return { visible: entities.length, hiddenByTime: 0, untimed: 0 };
    }
    return entities.reduce<TimelineFilterCounts>((counts, entity) => {
        const ms = entityTimeMs(entity);
        if (ms === null) {
            counts.untimed += 1;
            if (!options.strictUntimed) counts.visible += 1;
            return counts;
        }
        if (ms >= options.timeRange.start.getTime() && ms <= options.timeRange.end.getTime()) {
            counts.visible += 1;
        } else {
            counts.hiddenByTime += 1;
        }
        return counts;
    }, { visible: 0, hiddenByTime: 0, untimed: 0 });
}
