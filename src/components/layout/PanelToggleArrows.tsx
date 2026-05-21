"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { useIsMobile } from "@/core/hooks/useIsMobile";
import { useStore } from "@/core/state/store";
import { trackEvent } from "@/lib/analytics";

export function PanelToggleArrows() {
    const isMobile = useIsMobile();
    const leftSidebarOpen = useStore((s) => s.leftSidebarOpen);
    const configPanelOpen = useStore((s) => s.configPanelOpen);
    const openMobilePanel = useStore((s) => s.openMobilePanel);
    const mobileRightPanelGlow = useStore((s) => s.mobileRightPanelGlow);
    const toggleLeftSidebar = useStore((s) => s.toggleLeftSidebar);
    const toggleConfigPanel = useStore((s) => s.toggleConfigPanel);
    const setOpenMobilePanel = useStore((s) => s.setOpenMobilePanel);
    const filterCount = useStore((s) => Object.values(s.filters).reduce((sum, pf) => sum + Object.keys(pf).length, 0));

    const isLeftOpen = isMobile ? openMobilePanel === "left" : leftSidebarOpen;
    const isRightOpen = isMobile ? openMobilePanel === "right" : configPanelOpen;

    const handleLeftToggle = () => {
        if (isMobile) setOpenMobilePanel("left");
        else toggleLeftSidebar();
        trackEvent("panel-toggle", { panel: "left", open: true });
    };

    const handleRightToggle = () => {
        if (isMobile) setOpenMobilePanel("right");
        else toggleConfigPanel();
        trackEvent("panel-toggle", { panel: "right", open: true });
    };

    return (
      <>
        {!isLeftOpen && (
          <button
            type="button"
            className={`panel-toggle-btn panel-toggle-btn--left ${isMobile ? "panel-toggle-btn--mobile" : ""}`}
            onClick={handleLeftToggle}
            title="Show data panel"
            aria-label="Show data panel"
            data-testid="panel-toggle-left"
          >
            <ChevronRight size={18} />
          </button>
        )}

        {!isRightOpen && (
          <button
            type="button"
            className={`panel-toggle-btn panel-toggle-btn--right ${isMobile ? "panel-toggle-btn--mobile" : ""} ${isMobile && mobileRightPanelGlow ? "panel-toggle-btn--glow" : ""}`}
            onClick={handleRightToggle}
            title="Show inspector"
            aria-label="Show inspector"
            data-testid="panel-toggle-right"
          >
            <ChevronLeft size={18} />
            {filterCount > 0 && (
              <span className="filter-badge filter-badge--toggle">
                {filterCount}
              </span>
            )}
          </button>
        )}
      </>
    );
}
