import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFl511Cameras } from "./fl511Fetcher";

describe("fetchFl511Cameras", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes FL511 ArcGIS camera features", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                exceededTransferLimit: false,
                features: [
                    {
                        attributes: {
                            OBJECTID_1: 7,
                            ID: "CCTV-7",
                            DESCRIPT: "I-95 at Sample Road",
                            COUNTY: "Broward",
                            HIGHWAY: "I-95",
                            DIRECTION: "Northbound",
                            LATITUDE: 26.123,
                            LONGITUDE: -80.456,
                            TIMESTAMP: "2026-05-25 10:00:00",
                            IMAGE: "https://example.test/camera.jpg",
                        },
                    },
                ],
            }),
        }));

        const cameras = await fetchFl511Cameras();

        expect(cameras).toEqual([
            expect.objectContaining({
                type: "Feature",
                geometry: { type: "Point", coordinates: [-80.456, 26.123] },
                properties: expect.objectContaining({
                    id: "fl511-CCTV-7",
                    source: "fl511",
                    stream: "https://example.test/camera.jpg",
                    streamType: "image",
                    region: "Broward County, Florida",
                    route: "I-95",
                    direction: "Northbound",
                }),
            }),
        ]);
    });

    it("skips records without HTTPS image URLs", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                exceededTransferLimit: false,
                features: [
                    {
                        attributes: {
                            OBJECTID_1: 1,
                            LATITUDE: 26.123,
                            LONGITUDE: -80.456,
                            IMAGE: "http://example.test/insecure.jpg",
                        },
                    },
                ],
            }),
        }));

        await expect(fetchFl511Cameras()).resolves.toEqual([]);
    });
});
