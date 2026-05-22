export async function register() {
  if (process.env.NEXT_PUBLIC_WWV_ENABLE_SENTRY !== "true") return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture errors from Server Components, middleware, and proxies
export async function onRequestError(...args: unknown[]) {
  if (process.env.NEXT_PUBLIC_WWV_ENABLE_SENTRY !== "true") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args as Parameters<typeof Sentry.captureRequestError>);
}
