// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/ssrf", () => ({
    safeFetch: vi.fn(async () => new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
    })),
}));

import { POST } from "./route";

describe("/api/plugins/doctor", () => {
    it("returns sanitized normalized probe results", async () => {
        const request = new NextRequest("http://localhost/api/plugins/doctor", {
            method: "POST",
            body: JSON.stringify({ url: "https://example.test/feed" }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            ok: true,
            status: 200,
            shape: "items",
        });
    });

    it("rejects missing URLs", async () => {
        const request = new NextRequest("http://localhost/api/plugins/doctor", {
            method: "POST",
            body: JSON.stringify({}),
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
    });
});
