import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageryPicker } from "./ImageryPicker";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("@/core/globe/ImageryProviderFactory", () => ({
    IMAGERY_LAYERS: [
        {
            id: "broken-layer",
            name: "Broken Thumbnail",
            thumbnail: "/missing-thumbnail.jpg",
            type: "imagery",
        },
    ],
}));

vi.mock("@/core/state/store", () => ({
    useStore: (selector: (state: {
        mapConfig: {
            baseLayerId: string;
            fallbackLayerId: string | null;
            sceneMode: number;
        };
        updateMapConfig: () => void;
    }) => unknown) => selector({
        mapConfig: {
            baseLayerId: "broken-layer",
            fallbackLayerId: null,
            sceneMode: 3,
        },
        updateMapConfig: vi.fn(),
    }),
}));

describe("ImageryPicker", () => {
    it("marks broken thumbnail images for the CSS fallback", () => {
        const { container } = render(<ImageryPicker />);

        const image = container.querySelector("img");
        if (!image) throw new Error("Expected imagery thumbnail image");
        fireEvent.error(image);

        expect(image.classList.contains("imagery-item__image--broken")).toBe(true);
    });
});
