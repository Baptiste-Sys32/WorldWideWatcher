"use client";

import dynamic from "next/dynamic";

const AppShell = dynamic(
    () => import("@/components/layout/AppShell").then((mod) => mod.AppShell),
    {
        ssr: false,
        loading: () => (
          <div className="boot-overlay">
            <div className="boot-overlay__rings">
              <div className="boot-overlay__ring boot-overlay__ring--1" />
              <div className="boot-overlay__ring boot-overlay__ring--2" />
              <div className="boot-overlay__ring boot-overlay__ring--3" />
              <div className="boot-overlay__core" />
            </div>
            <div className="boot-overlay__title">WorldWideView</div>
            <div className="boot-overlay__status">Initializing Systems...</div>
          </div>
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
