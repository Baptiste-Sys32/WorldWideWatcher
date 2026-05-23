import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthEnabled } from "@/core/edition";
import { safeFetch } from "@/lib/security/ssrf";

export async function GET(req: NextRequest) {
    if (isAuthEnabled) {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const targetUrl = req.nextUrl.searchParams.get("url");
    if (!targetUrl) {
        return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
    }

    try {
        const parsed = new URL(targetUrl);
        if (parsed.hostname === "balticlivecam.com" || parsed.hostname.endsWith(".balticlivecam.com")) {
            const response = await safeFetch(targetUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                timeout: 8_000,
                maxSize: 1024 * 1024,
            });
            const html = await response.text();

            const idMatch = html.match(/id:\s*(\d+)/);
            if (!idMatch) {
                return NextResponse.json({ error: "Could not find camera ID on balticlivecam" }, { status: 400 });
            }
            const cameraId = idMatch[1];

            const ajaxUrl = `https://balticlivecam.com/wp-admin/admin-ajax.php?action=auth_token&id=${cameraId}&embed=1&main_referer=`;
            const ajaxRes = await safeFetch(ajaxUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    Referer: targetUrl
                },
                timeout: 8_000,
                maxSize: 512 * 1024,
            });
            const ajaxHtml = await ajaxRes.text();

            const streamMatch = ajaxHtml.match(/src:\s*'([^']+m3u8[^']+)'/);
            if (streamMatch && streamMatch[1]) {
                return NextResponse.json({ streamUrl: streamMatch[1] });
            }
                return NextResponse.json({ error: "Could not find m3u8 stream on balticlivecam backend" }, { status: 404 });
        }

        return NextResponse.json({ error: "Unsupported extractor platform" }, { status: 400 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[CameraExtractor] Error:", message);
        return NextResponse.json({ error: "Failed to extract stream" }, { status: 500 });
    }
}
