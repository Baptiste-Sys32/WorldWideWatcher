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

type BootStartMode = "normal" | "safety";

// The overlay intentionally lingers after the globe reports ready. In dev,
// Next can still be compiling route chunks while the client begins booting.
const NORMAL_DELAY = {
    flyIn: 0,
    overlayFade: 8_000,
    header: 8_700,
    sidebar: 9_300,
    timeline: 9_900,
    controls: 10_200,
    done: 11_000,
} as const;

const SAFETY_DELAY = {
    flyIn: 0,
    overlayFade: 2_000,
    header: 2_700,
    sidebar: 3_300,
    timeline: 3_900,
    controls: 4_200,
    done: 5_000,
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

    const startBoot = useCallback((mode: BootStartMode = "normal") => {
        if (started.current) return;
        started.current = true;
        const delay = mode === "safety" ? SAFETY_DELAY : NORMAL_DELAY;

        // Trigger camera fly-in from deep space via existing preset system
        const t0 = setTimeout(() => {
            dataBus.emit("cameraPreset", { presetId: "global" });
        }, delay.flyIn);

        // Phase → booting (overlay fades out)
        const t1 = setTimeout(() => {
            setState((s) => ({ ...s, phase: "booting" }));
        }, delay.overlayFade);

        const t2 = setTimeout(() => {
            setState((s) => ({ ...s, headerReady: true }));
        }, delay.header);

        const t3 = setTimeout(() => {
            setState((s) => ({ ...s, sidebarReady: true }));
        }, delay.sidebar);

        const t4 = setTimeout(() => {
            setState((s) => ({ ...s, timelineReady: true }));
        }, delay.timeline);

        const t5 = setTimeout(() => {
            setState((s) => ({ ...s, controlsReady: true }));
        }, delay.controls);

        const t6 = setTimeout(() => {
            setState((s) => ({ ...s, phase: "ready" }));
        }, delay.done);

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
        }, delay.done + 2_000);

        timers.current = [t0, t1, t2, t3, t4, t5, t6, t7];
    }, []);

    const cleanup = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        started.current = false;
    }, []);

    return { ...state, startBoot, cleanup };
}
