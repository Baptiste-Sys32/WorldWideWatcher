"use client";

import dynamic from "next/dynamic";
import "@/components/common/BootOverlay.css";

const AppShell = dynamic(
    () => import("@/components/layout/AppShell").then((mod) => mod.AppShell),
    {
        ssr: false,
        loading: () => (
          <div className="boot-overlay boot-overlay--fallback" aria-hidden="true" />
        ),
    },
);

const DemoAdStrip = dynamic(
    () => import("@/components/ads/DemoAdStrip").then((mod) => mod.DemoAdStrip),
    { ssr: false },
);

export function AppClient() {
    return (
      <>
        <AppShell />
        <DemoAdStrip />
      </>
    );
}
