import type { StateCreator } from "zustand";
import type { AppStore } from "./store";

export type SourceHealthStatus = "idle" | "loading" | "healthy" | "degraded" | "error" | "stale";
export type SourceType = "rest" | "ws" | "static" | "composite";

export interface SourceHealth {
    status: SourceHealthStatus;
    lastSuccessAt?: number;
    lastAttemptAt?: number;
    lastErrorAt?: number;
    lastErrorMessage?: string | null;
    sourceName?: string;
    sourceUrl?: string;
    sourceType?: SourceType;
    fallbackActive?: boolean;
    itemCount?: number;
    latencyMs?: number;
}

export interface SourceHealthSlice {
    sourceHealthByPlugin: Record<string, SourceHealth>;
    setSourceHealth: (pluginId: string, patch: Partial<SourceHealth>) => void;
    clearSourceHealth: (pluginId: string) => void;
}

export function sanitizeHealthMessage(message: unknown): string | null {
    if (!message) return null;
    const text = String(message)
        .replace(/([?&](?:key|token|api_key|apikey|access_token|authorization)=)[^&\s]+/gi, "$1[redacted]")
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
        .replace(/[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]+@/g, "[redacted]@");
    return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

export const createSourceHealthSlice: StateCreator<AppStore, [], [], SourceHealthSlice> = (set) => ({
    sourceHealthByPlugin: {},
    setSourceHealth: (pluginId, patch) => set((state) => {
        const previous = state.sourceHealthByPlugin[pluginId] ?? { status: "idle" as SourceHealthStatus };
        return {
            sourceHealthByPlugin: {
                ...state.sourceHealthByPlugin,
                [pluginId]: {
                    ...previous,
                    ...patch,
                    lastErrorMessage: patch.lastErrorMessage === undefined
                        ? previous.lastErrorMessage
                        : sanitizeHealthMessage(patch.lastErrorMessage),
                },
            },
        };
    }),
    clearSourceHealth: (pluginId) => set((state) => {
        const next = { ...state.sourceHealthByPlugin };
        delete next[pluginId];
        return { sourceHealthByPlugin: next };
    }),
});
