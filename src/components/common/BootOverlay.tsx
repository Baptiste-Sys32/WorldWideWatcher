/**
 * @file BootOverlay.tsx
 * @description A high-fidelity loading overlay displayed during application initialization.
 * Features an old terminal-style boot sequence and brand identity.
 * @module src/components/common
 */

"use client";

import { useEffect, useRef, useState } from "react";
import "./BootOverlay.css";

const BOOT_TITLE = String.raw`
 __        __         _     _ __        ___     _       __        __    _       _               
 \ \      / /__  _ __| | __| |\ \      / (_) __| | ___  \ \      / /_ _| |_ ___| |__   ___ _ __ 
  \ \ /\ / / _ \| '__| |/ _' | \ \ /\ / /| |/ _' |/ _ \  \ \ /\ / / _' | __/ __| '_ \ / _ \ '__|
   \ V  V / (_) | |  | | (_| |  \ V  V / | | (_| |  __/   \ V  V / (_| | || (__| | | |  __/ |   
    \_/\_/ \___/|_|  |_|\__,_|   \_/\_/  |_|\__,_|\___|    \_/\_/ \__,_|\__\___|_| |_|\___|_|   
`;

const BOOT_LINES = [
    "ROM CHECKSUM 7B11:44A0 PASSED",
    "MEMORY TEST 00000000-000FFFFF OK",
    "EXTENDED MEMORY 524288K OK",
    "CACHE SRAM BANK 0 .............. OK",
    "CACHE SRAM BANK 1 .............. OK",
    "CMOS CLOCK READ 16:34:22 UTC",
    "LOADING WWATCHER.SYS",
    "LOADING HIMEM.SYS",
    "LOADING EMM386.EXE NOEMS",
    "CONFIG.SYS: DEVICE=GLOBE0",
    "CONFIG.SYS: DEVICE=DATBUS11",
    "CONFIG.SYS: DEVICE=SATVEC32",
    "CONFIG.SYS: BUFFERS=64",
    "CONFIG.SYS: FILES=120",
    "AUTOEXEC: SET FEED_ROOT=/WORLD",
    "AUTOEXEC: PATH=C:\\WWV;C:\\WWV\\BIN",
    "AUTOEXEC: MODE CON COLS=132 LINES=60",
    "MOUNTING /dev/earth ............. OK",
    "MOUNTING /dev/orbit ............. OK",
    "MOUNTING /dev/weather ........... OK",
    "MOUNTING /dev/incidents ......... OK",
    "PROBING CESIUM GRAPHICS BUS ..... OK",
    "DETECTING DISPLAY ADAPTER ....... VGA",
    "SETTING VIDEO MODE 13H .......... OK",
    "ALLOCATING FRAME BUFFER ......... OK",
    "OPENING TILE CACHE .............. OK",
    "INDEXING TERRAIN QUADRANTS ...... OK",
    "WARMING IMAGERY PROVIDERS ....... OK",
    "CHECKING PLUGIN MANIFESTS ....... OK",
    "SEEDING ENTROPY POOL ............ OK",
    "INITIALIZING CRYPTO MODULES ..... OK",
    "CHECKING GPU EXTENSIONS ......... OK",
    "ALLOCATING GPU TILES ............ OK",
    "PRIMING ELEVATION CACHE ......... OK",
    "PRIMING VECTOR CACHE ............ OK",
    "PRIMING RASTER CACHE ............ OK",
    "COMPILING SHADER PROGRAMS ....... OK",
    "COMPILING ATMOSPHERE SHADERS .... OK",
    "COMPILING OCEAN SHADERS ......... OK",
    "COMPILING CLOUD LAYERS .......... OK",
    "LOADING COASTLINE VECTORS ....... OK",
    "LOADING BATHYMETRY GRID ......... OK",
    "LOADING POPULATION DENSITY ...... OK",
    "LOADING LAND COVER CLASSIFIER ... OK",
    "LOADING NIGHT LIGHTS LAYER ...... OK",
    "LOADING FLIGHT CORRIDORS ........ OK",
    "LOADING MARITIME AIS ............ OK",
    "LOADING ADS-B FEED CACHE ........ OK",
    "LOADING ORBITAL ELEMENTS ........ OK",
    "LOADING SATELLITE IMAGERY INDEX . OK",
    "OPENING ARCHIVE CHANNELS ........ OK",
    "OPENING LIVE CHANNELS ........... OK",
    "OPENING REPLAY CHANNELS ......... OK",
    "INITIALIZING TELEMETRY BUS ...... OK",
    "INITIALIZING ALERT ROUTER ....... OK",
    "SYNCING TIME SOURCES ............ OK",
    "SYNCING LEAP SECONDS ............ OK",
    "LOADING EVENT TAXONOMY .......... OK",
    "LOADING INCIDENT CORRELATION .... OK",
    "LOADING OPERATOR PROFILES ....... OK",
    "LOADING HUD LAYOUTS ............. OK",
    "LOADING KEYBIND MAP ............. OK",
    "CALIBRATING INPUT GRID .......... OK",
    "VALIDATING DATA BUS FILTERS ..... OK",
    "VALIDATING VIEWPORT GUARDS ...... OK",
    "INITIALIZING FIELD OF VIEW ...... OK",
    "INITIALIZING SUN POSITION ....... OK",
    "INITIALIZING MOON POSITION ...... OK",
    "INITIALIZING STAR CATALOG ....... OK",
    "RUNNING SELF TEST SUITE ......... OK",
    "SELF TEST: SENSOR ARRAY ......... OK",
    "SELF TEST: LINK BUDGET .......... OK",
    "SELF TEST: POWER GRID ........... OK",
    "SELF TEST: STORAGE RAID ......... OK",
    "SELF TEST: SECURITY MODULE ...... OK",
    "SELF TEST: STREAM ROUTER ........ OK",
    "SELF TEST: PLUGIN LOADER ........ OK",
    "SELF TEST: UI PIPELINE .......... OK",
    "VERIFYING BUILT-IN FEEDS ........ OK",
    "VERIFYING MARKETPLACE CACHE ..... OK",
    "STARTING POLLING MANAGER ........ OK",
    "OPENING HTTP TRANSPORT .......... OK",
    "OPENING WEBSOCKET TRANSPORT ..... OK",
    "CELESTRAK ADAPTER READY",
    "CELESTRAK STARLINK TLE FALLBACK . READY",
    "GPS JAMMING FEED READY",
    "NOAA/NWS FEED READY",
    "NASA EONET FEED READY",
    "GDACS FEED READY",
    "OPENAQ FEED READY",
    "NDBC BUOY FEED READY",
    "CAMERA MATRIX CALIBRATED",
    "CAMERA PRESET TABLE LOADED",
    "TIMELINE CLOCK SYNCHRONIZED",
    "ESTABLISHING DATA BUS IRQ 11 .... OK",
    "SUBSCRIBING TO LAYER EVENTS ..... OK",
    "SUBSCRIBING TO SOURCE HEALTH .... OK",
    "LINKING ENTITY RENDERER ......... OK",
    "LINKING SELECTION HANDLER ....... OK",
    "LINKING HORIZON CULLER .......... OK",
    "ALLOCATING ORBITAL INDEX ........ OK",
    "ALLOCATING H3 CELL INDEX ........ OK",
    "ALLOCATING INCIDENT INDEX ....... OK",
    "VERIFYING SOURCE HEALTH TABLE ... OK",
    "CHECKING CACHE AGE LIMITS ....... OK",
    "CHECKING LOCAL STORAGE .......... OK",
    "CHECKING USER WORKSPACE ......... OK",
    "STARTING PANEL BUS .............. OK",
    "STARTING MAP CONTROLS ........... OK",
    "STARTING TIMELINE CONTROLS ...... OK",
    "FINALIZING BOOT VECTOR .......... OK",
    "STARTING WORLDWIDEWATCHER",
    "READY",
] as const;

const BOOT_LINE_INTERVAL_MS = 65;

/**
 * Props for the BootOverlay component.
 */
interface BootOverlayProps {
    /** Whether the overlay is currently visible on top of the application. */
    visible: boolean;
}

/**
 * @component BootOverlay
 * @description Animated splash screen for initial system boot.
 *
 * @param {BootOverlayProps} props - Component properties.
 */
export function BootOverlay({ visible }: BootOverlayProps) {
    const [visibleLineCount, setVisibleLineCount] = useState(0);
    const logViewportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!visible) return;

        let nextLineCount = 0;
        let timeout: number | undefined;

        const revealNextLine = () => {
            nextLineCount += 1;
            setVisibleLineCount(nextLineCount);

            if (nextLineCount < BOOT_LINES.length) {
                timeout = window.setTimeout(revealNextLine, BOOT_LINE_INTERVAL_MS);
            }
        };

        timeout = window.setTimeout(revealNextLine, 0);

        return () => {
            if (timeout !== undefined) {
                window.clearTimeout(timeout);
            }
        };
    }, [visible]);

    useEffect(() => {
        const viewport = logViewportRef.current;
        if (!viewport) return;

        viewport.scrollTop = viewport.scrollHeight;
    }, [visibleLineCount]);

    return (
      <div className={`boot-overlay ${visible ? "" : "boot-overlay--hidden"}`}>
        <div className="boot-overlay__crt" aria-hidden="true" />
        <div className="boot-overlay__terminal" role="status" aria-live="polite">
          <pre className="boot-overlay__brand" aria-label="WorldWideWatcher">{BOOT_TITLE}</pre>
          <div className="boot-overlay__log-viewport" ref={logViewportRef}>
            <div className="boot-overlay__log">
              {BOOT_LINES.slice(0, visibleLineCount).map((line, index) => (
                <div
                  key={`${line}-${index}`}
                  className="boot-overlay__line"
                >
                  <span className="boot-overlay__line-prefix">{index.toString().padStart(3, "0")}</span>
                  <span>{line}</span>
                </div>
              ))}
              {visibleLineCount >= BOOT_LINES.length && (
                <div className="boot-overlay__cursor-line">
                  <span>C:\WWV&gt;</span>
                  <span className="boot-overlay__cursor" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
}
