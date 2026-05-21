# WorldWideView Local UI Revamp Status

Date: 2026-05-21

## What Changed

- Ported the OLED/local UI shell into the real app instead of keeping the old sidebar/tab layout mixed with the mockup.
- Reworked the header around local use: Map, Layers, Filters, Settings, search, and theme controls.
- Removed the old top status pills from the main header and moved operational status into Settings.
- Made the left and right panels resizable and collapsible.
- Replaced the left panel's physical Data / Imagery / Plugins tab strip with a compact icon cycler.
- Made the main Plugins panel cleaner by removing Marketplace and Check for Updates from the primary page.
- Kept Marketplace and Check for Updates inside Settings under Plugin Management.
- Moved import, diagnostics, render settings, FPS toggle, local engine status, plugin settings, and plugin management into Settings.
- Moved Map region presets and Filters/time-window controls into temporary right-side overlays.
- Moved Camera Stats into the bottom dock behavior, beside Timeline.
- Removed the permanent FPS/debug HUD from the main viewport.
- Pinned the Next.js 16 development indicator to the top-right through `next.config.ts`.
- Fixed the Imagery panel layout so the view mode and imagery cards fit without horizontal scrolling.
- Wired plugin detail/sidebar components into the inspector and plugin settings into Settings.
- Added a local aviation fallback API at `/api/aviation` using OpenSky live state vectors.
- Forced the aviation plugin to poll the local fallback every 15 seconds when its remote WebSocket source is silent.
- Normalized aviation altitude values so aircraft render at real meter altitude.

## Verification

- `pnpm exec tsc --noEmit` passed.
- `pnpm run lint` passed with existing repository warnings and no errors.
- Browser verification confirmed:
  - left panel uses the icon cycler and no longer renders the physical tab strip,
  - main Plugins panel has no Marketplace / Check for Updates controls,
  - Settings still exposes Marketplace / Check for Updates under Plugin Management,
  - Aviation loads 5,000 live entities through the local OpenSky fallback.

## Source Notes

- Next.js dev indicator position uses `devIndicators.position`.
- OpenSky is now used only as a local fallback route for this local copy. The remote WWV data engine still advertises `aviation`, but its snapshot endpoint returned `404 Snapshot not found or seeder not running` during this pass, and the WebSocket did not emit aviation data during testing.

## Planned Follow-Up

- Refine the left icon cycler visuals if it feels too cryptic after real use.
- Add clearer "source degraded/fallback active" UI for aviation instead of silently using OpenSky.
- Make the aviation source configurable between WWV engine, OpenSky, and possibly another ADS-B provider.
- Add a small settings control for local source priority and polling interval.
- Revisit the right inspector for dense entity metadata once more real plugin detail components are surfaced.
- Clean up the remaining old CSS and component paths after the UI settles.
- Add targeted tests for the new `/api/aviation` normalizer and the Settings/main Plugins split.
- Consider moving screenshots/mockups out of git later if the repo should stay lean.

## Artifacts

Supporting mockups, screenshots, and the original transition notes were moved to:

`docs/local-ui-revamp/`
