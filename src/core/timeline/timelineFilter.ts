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

/**
 * Parses a timestamp-like value into epoch milliseconds.
 *
 * @param raw - Timestamp candidate from entity data.
 * @returns Epoch milliseconds or null when invalid.
 */
function parseTimestamp(raw: unknown): number | null {
    if (!raw) return null;
    if (raw instanceof Date) {
        return Number.isNaN(raw.getTime()) ? null : raw.getTime();
    }
    if (typeof raw === "number") {
        return Number.isFinite(raw) ? raw : null;
    }
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
            return numeric;
        }
        const date = new Date(trimmed);
        return Number.isNaN(date.getTime()) ? null : date.getTime();
    }
    return null;
}

/**
 * Extracts a normalized timestamp for timeline filtering.
 *
 * @param entity - Entity to inspect.
 * @returns Epoch milliseconds or null when missing.
 */
function entityTimeMs(entity: GeoEntity): number | null {
    const raw = entity.timestamp ?? entity.properties?.timestamp ?? entity.properties?.date ?? entity.properties?.time;
    return parseTimestamp(raw);
}

/**
 * Determines whether an entity is visible within the active timeline state.
 *
 * @param entity - Entity to evaluate.
 * @param options - Playback mode and time range configuration.
 * @returns True if the entity should be shown.
 */
export function isEntityVisibleInTimeline(entity: GeoEntity, options: TimelineFilterOptions): boolean {
    if (!options.playbackMode) return true;
    const ms = entityTimeMs(entity);
    if (ms === null) return !options.strictUntimed;
    return ms >= options.timeRange.start.getTime() && ms <= options.timeRange.end.getTime();
}

/**
 * Filters a collection of items by their entity timestamp and playback range.
 *
 * @param items - Item collection with embedded entities.
 * @param options - Playback mode and time range configuration.
 * @returns Filtered collection of items.
 */
export function filterEntitiesForTimeline<T extends { entity: GeoEntity }>(
    items: T[],
    options: TimelineFilterOptions,
): T[] {
    if (!options.playbackMode) return items;
    return items.filter((item) => isEntityVisibleInTimeline(item.entity, options));
}

/**
 * Computes visibility counts for a set of entities relative to playback state.
 *
 * @param entities - Entity list to evaluate.
 * @param options - Playback mode and time range configuration.
 * @returns Visibility counts for the timeline summary.
 */
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
