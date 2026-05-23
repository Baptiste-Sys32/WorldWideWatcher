// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/ssrf", () => ({
    safeFetch: vi.fn(async () => new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
    })),
}));

import { safeFetch } from "@/lib/security/ssrf";
import { POST } from "./route";

describe("/api/plugins/doctor", () => {
    const mockedSafeFetch = vi.mocked(safeFetch);

    it("returns sanitized normalized probe results", async () => {
        mockedSafeFetch.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
        }));
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
            contentType: "application/json",
        });
        expect(typeof body.responseMs).toBe("number");
    });

    it("rejects missing URLs", async () => {
        const request = new NextRequest("http://localhost/api/plugins/doctor", {
            method: "POST",
            body: JSON.stringify({}),
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
    });

    it("sanitizes upstream failures without leaking error details", async () => {
        mockedSafeFetch.mockRejectedValueOnce(new Error("connect ECONNREFUSED https://example.test?token=secret"));
        const request = new NextRequest("http://localhost/api/plugins/doctor", {
            method: "POST",
            body: JSON.stringify({ url: "https://example.test/feed" }),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(502);
        expect(body.ok).toBe(false);
        expect(body.error).toBe("Probe failed");
        expect(String(body.error)).not.toContain("secret");
        expect(typeof body.responseMs).toBe("number");
    });
});
