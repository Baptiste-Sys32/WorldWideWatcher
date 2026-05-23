import { describe, expect, it } from "vitest";
import type { GeoEntity } from "@/core/plugins/PluginTypes";
import {
    countTimelineFilteredEntities,
    filterEntitiesForTimeline,
    isEntityVisibleInTimeline,
} from "./timelineFilter";

function entity(id: string, timestamp: unknown): GeoEntity {
    return {
        id,
        pluginId: "p1",
        latitude: 1,
        longitude: 2,
        timestamp: timestamp as Date,
        properties: {},
    };
}

const range = {
    start: new Date("2026-05-22T10:00:00Z"),
    end: new Date("2026-05-22T11:00:00Z"),
};

describe("timelineFilter", () => {
    it("keeps everything visible outside playback mode", () => {
        expect(isEntityVisibleInTimeline(entity("old", new Date("2026-05-21T10:00:00Z")), {
            playbackMode: false,
            timeRange: range,
        })).toBe(true);
    });

    it("filters entities outside the active time range during playback", () => {
        const items = [
            { entity: entity("in", new Date("2026-05-22T10:30:00Z")) },
            { entity: entity("out", new Date("2026-05-22T12:00:00Z")) },
        ];

        expect(filterEntitiesForTimeline(items, { playbackMode: true, timeRange: range }).map((item) => item.entity.id)).toEqual(["in"]);
    });

    it("counts hidden and untimed entities", () => {
        const counts = countTimelineFilteredEntities([
            entity("in", new Date("2026-05-22T10:30:00Z")),
            entity("out", new Date("2026-05-22T12:00:00Z")),
            entity("bad", "not-a-date"),
        ], { playbackMode: true, timeRange: range });

        expect(counts).toEqual({ visible: 2, hiddenByTime: 1, untimed: 1 });
    });
});
