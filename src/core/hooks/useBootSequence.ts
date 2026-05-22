"use client";

import { useState, useCallback, useRef } from "react";
import { dataBus } from "@/core/data/DataBus";

export type BootPhase = "loading" | "booting" | "ready";

export interface BootState {
    phase: BootPhase;
    headerReady: boolean;
    sidebarReady: boolean;
    timelineReady: boolean;
    controlsReady: boolean;
}

// Now event-driven (triggered after tiles load), so delays are short.
// Camera fly-in starts immediately; overlay fades at 500ms.
const DELAY = {
    flyIn: 0,
    overlayFade: 500,
    header: 1200,
    sidebar: 1800,
    timeline: 2400,
    controls: 2700,
    done: 3500,
} as const;

/**
 * Orchestrates the staggered sci-fi boot-up animation sequence.
 * Call `startBoot()` once the globe tiles have loaded.
 */
export function useBootSequence() {
    const [state, setState] = useState<BootState>({
        phase: "loading",
        headerReady: false,
        sidebarReady: false,
        timelineReady: false,
        controlsReady: false,
    });

    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const started = useRef(false);

    const startBoot = useCallback(() => {
        if (started.current) return;
        started.current = true;

        // Trigger camera fly-in from deep space via existing preset system
        const t0 = setTimeout(() => {
            dataBus.emit("cameraPreset", { presetId: "global" });
        }, DELAY.flyIn);

        // Phase → booting (overlay fades out)
        const t1 = setTimeout(() => {
            setState((s) => ({ ...s, phase: "booting" }));
        }, DELAY.overlayFade);

        const t2 = setTimeout(() => {
            setState((s) => ({ ...s, headerReady: true }));
        }, DELAY.header);

        const t3 = setTimeout(() => {
            setState((s) => ({ ...s, sidebarReady: true }));
        }, DELAY.sidebar);

        const t4 = setTimeout(() => {
            setState((s) => ({ ...s, timelineReady: true }));
        }, DELAY.timeline);

        const t5 = setTimeout(() => {
            setState((s) => ({ ...s, controlsReady: true }));
        }, DELAY.controls);

        const t6 = setTimeout(() => {
            setState((s) => ({ ...s, phase: "ready" }));
        }, DELAY.done);

        // Development HMR and slow first compiles can interrupt staggered timers.
        // This guarantees the app cannot stay behind the splash indefinitely.
        const t7 = setTimeout(() => {
            setState({
                phase: "ready",
                headerReady: true,
                sidebarReady: true,
                timelineReady: true,
                controlsReady: true,
            });
        }, DELAY.done + 2_000);

        timers.current = [t0, t1, t2, t3, t4, t5, t6, t7];
    }, []);

    const cleanup = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        started.current = false;
    }, []);

    return { ...state, startBoot, cleanup };
}
