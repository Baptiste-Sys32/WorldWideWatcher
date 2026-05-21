import { describe, expect, it } from "vitest";
import { Atom } from "lucide-react";
import { createSvgIconUrl } from "./src";

function decodeSvgDataUrl(url: string): string {
    return decodeURIComponent(url.replace("data:image/svg+xml;charset=utf-8,", ""));
}

describe("createSvgIconUrl", () => {
    it("serializes Lucide React icons without react-dom/server", () => {
        const svg = decodeSvgDataUrl(createSvgIconUrl(Atom, { color: "#22c55e" }));

        expect(svg).toContain("<svg");
        expect(svg).toContain("<circle");
        expect(svg).toContain("viewBox=");
        expect(svg).toContain("stroke=\"#22c55e\"");
        expect(svg).toContain("stroke-width=");
        expect(svg).not.toContain("strokeWidth=");
    });

    it("can return the raw icon without a background wrapper", () => {
        const svg = decodeSvgDataUrl(createSvgIconUrl(Atom, {
            background: false,
            color: "#38bdf8",
        }));

        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain("viewBox=");
        expect(svg).toContain("stroke=\"#38bdf8\"");
    });
});
