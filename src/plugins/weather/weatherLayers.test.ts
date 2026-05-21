// @vitest-environment node
import {
    beforeEach, describe, expect, it, vi
} from "vitest";
import { GET } from "@/app/api/weather/layers/route";

describe("/api/weather/layers", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns available layers with tile URL when configured", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "test-key-123");

        const response = await GET();
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.configured).toBe(true);
        expect(json.tileUrlTemplate).toBe("/api/weather/tile/{z}/{x}/{y}?layer={layer}");
        expect(json.layers).toHaveLength(5);
    });

    it("returns configured=false and null tile URL when key is missing", async () => {
        vi.stubEnv("OPENWEATHERMAP_API_KEY", "");

        const response = await GET();
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.configured).toBe(false);
        expect(json.tileUrlTemplate).toBeNull();
        expect(json.layers.map((layer: { id: string }) => layer.id)).toEqual([
            "clouds_new",
            "precipitation_new",
            "pressure_new",
            "wind_new",
            "temp_new",
        ]);
    });
});
