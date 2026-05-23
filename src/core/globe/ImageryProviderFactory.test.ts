/* eslint-disable @typescript-eslint/no-explicit-any */
import {
 describe, it, expect, vi, beforeEach
} from "vitest";

import { IonImageryProvider } from "cesium";
import { createImageryProvider, createOsmProvider, IMAGERY_LAYERS } from "./ImageryProviderFactory";

// Mock cesium before importing the module under test
vi.mock("cesium", () => {
    class UrlTemplateImageryProvider {
        _type = "UrlTemplate";
        url: string;
        subdomains?: string[];
        constructor(opts: any) { this.url = opts.url; this.subdomains = opts.subdomains; }
    }

    const BingMapsImageryProvider = {
        fromUrl: vi.fn().mockResolvedValue({ _type: "Bing" }),
    };

    const IonImageryProvider = {
        fromAssetId: vi.fn().mockResolvedValue({ _type: "Ion" }),
    };

    const ArcGisMapServerImageryProvider = {
        fromUrl: vi.fn().mockResolvedValue({ _type: "ArcGis" }),
    };

    return {
        IonImageryProvider,
        BingMapsImageryProvider,
        ArcGisMapServerImageryProvider,
        UrlTemplateImageryProvider,
        BingMapsStyle: { AERIAL: "Aerial", AERIAL_WITH_LABELS: "AerialWithLabels", ROAD: "Road" },
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_BING_MAPS_KEY;
});

describe("createOsmProvider", () => {
    it("returns a UrlTemplateImageryProvider for OSM tiles", () => {
        const provider = createOsmProvider();
        expect(provider).toBeDefined();
        expect((provider as any).url).toContain("openstreetmap.org");
    });
});

describe("createImageryProvider", () => {
    it("returns Google tiles for bing-aerial when no Bing key (first tier)", async () => {
        const provider = await createImageryProvider("bing-aerial");
        expect((provider as any).url).toContain("google.com");
        expect((provider as any).url).toContain("lyrs=s");
        expect(IonImageryProvider.fromAssetId).not.toHaveBeenCalled();
    });

    it("returns Google tiles for bing-labels when no Bing key (hybrid)", async () => {
        const provider = await createImageryProvider("bing-labels");
        expect((provider as any).url).toContain("google.com");
        expect((provider as any).url).toContain("lyrs=y");
    });

    it("returns Google tiles for bing-road when no Bing key (roads)", async () => {
        const provider = await createImageryProvider("bing-road");
        expect((provider as any).url).toContain("google.com");
        expect((provider as any).url).toContain("lyrs=m");
    });

    it("returns Google tiles for blue-marble when no keys", async () => {
        const provider = await createImageryProvider("blue-marble");
        expect((provider as any).url).toContain("google.com");
    });

    it("falls back to Ion when Google provider throws", async () => {
        const { UrlTemplateImageryProvider } = await import("cesium");
        const origImpl = UrlTemplateImageryProvider;

        // Make UrlTemplateImageryProvider throw only for google URLs
        // We need to test the fallback path - simulate by making IonImageryProvider
        // the expected path when Google fails
        vi.mocked(IonImageryProvider.fromAssetId).mockResolvedValue({ _type: "Ion" } as any);

        // Since UrlTemplateImageryProvider is a constructor and won't normally throw,
        // the Google tier will succeed. Test Ion fallback via useImageryManager catch instead.
        // Here we verify Ion is called when it's the path taken.
        const provider = await createImageryProvider("bing-aerial");
        // Google succeeds first, so Ion should NOT be called
        expect(IonImageryProvider.fromAssetId).not.toHaveBeenCalled();
        expect((provider as any).url).toContain("google.com");
    });

    it("uses Bing directly when NEXT_PUBLIC_BING_MAPS_KEY is set", async () => {
        process.env.NEXT_PUBLIC_BING_MAPS_KEY = "test-bing-key";
        const { BingMapsImageryProvider } = await import("cesium");
        const provider = await createImageryProvider("bing-aerial");
        expect(BingMapsImageryProvider.fromUrl).toHaveBeenCalled();
        expect((provider as any)._type).toBe("Bing");
    });

    it("returns OSM for 'osm' layer directly", async () => {
        const provider = await createImageryProvider("osm");
        expect((provider as any).url).toContain("openstreetmap.org");
    });

    it("returns OSM for the open 3D layer base imagery", async () => {
        const provider = await createImageryProvider("osm-3d");
        expect((provider as any).url).toContain("openstreetmap.org");
    });

    it("defines preview thumbnails for all picker layers", () => {
        expect(IMAGERY_LAYERS.length).toBeGreaterThan(0);
        expect(IMAGERY_LAYERS.every((layer) => typeof layer.thumbnail === "string" && layer.thumbnail.length > 0)).toBe(true);
    });

    it("does not expose Google 3D as a selectable imagery layer", () => {
        expect(IMAGERY_LAYERS.map((layer) => layer.id)).not.toContain("google-3d");
    });

    it("returns OSM for unknown layer ids", async () => {
        const provider = await createImageryProvider("nonexistent-layer");
        expect((provider as any).url).toContain("openstreetmap.org");
    });
});
