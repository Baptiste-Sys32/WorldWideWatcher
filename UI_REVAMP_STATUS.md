# WorldWideView Local UI Revamp Status

Date: 2026-05-22

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
- Added a local-only auth bypass flag, `WWV_DISABLE_AUTH`, so this single-user local copy can open straight into the globe without the login screen. The bypass is ignored in cloud edition.
- Updated favorites and marketplace management paths so local auth-disabled mode does not spam `401 Unauthorized` errors.
- Ported and verified the OpenWeatherMap weather overlay support:
  - `/api/weather/layers`
  - `/api/weather/tile/[z]/[x]/[y]`
  - Settings weather selector
  - Cesium weather imagery overlay.
- Added `OPENWEATHERMAP_API_KEY` to environment docs.
- Added Windows launch scripts:
  - `run-windows.ps1`
  - `run-windows.cmd`
- Fixed plugin SDK icon serialization so dynamic Lucide icons do not rely on browser-side `react-dom/server`.
- Normalized dynamic plugin entity IDs so bundles like Nuclear can emit internal IDs such as `nuclear` while the host stores/render them under the installed ID `nuclear-facilities`.
- Hardened the boot sequence so the splash screen cannot remain stuck on "Initializing Systems..." after the app is already loaded.
- Moved the heavy globe shell behind a no-SSR `AppClient` wrapper to reduce root page server-render work in local dev.
- Removed eager Sentry imports from local-critical startup/error paths that were causing Turbopack/runtime failures around `/api/marketplace/load` and `global-error.tsx`.
- Pinned Turbopack to the project root and allowed local dev origins for `localhost` / `127.0.0.1`.

## Verification

- `pnpm exec tsc --noEmit` passed.
- `pnpm run lint` passed with existing repository warnings and no errors.
- Browser verification confirmed:
  - left panel uses the icon cycler and no longer renders the physical tab strip,
  - main Plugins panel has no Marketplace / Check for Updates controls,
  - Settings still exposes Marketplace / Check for Updates under Plugin Management,
  - Aviation loads 5,000 live entities through the local OpenSky fallback.
- Localhost verification after the boot fixes confirmed:
  - first cold load reached app-ready in roughly 20 seconds after clearing `.next`,
  - warm load reached app-ready in roughly 8 seconds,
  - the boot overlay becomes `visibility: hidden` with opacity `0`,
  - `/api/marketplace/load` returns successfully,
  - weather Clouds overlay renders on the globe and weather tile requests return `200`.
- Focused test run passed:
  - `src/lib/AuthConfig.test.ts`
  - `src/core/edition.test.ts`
  - `src/plugins/weather/weatherLayers.test.ts`
  - `src/plugins/weather/weatherTile.test.ts`

## Source Notes

- Next.js dev indicator position uses `devIndicators.position`.
- OpenSky is now used only as a local fallback route for this local copy. The remote WWV data engine still advertises `aviation`, but its snapshot endpoint returned `404 Snapshot not found or seeder not running` during this pass, and the WebSocket did not emit aviation data during testing.
- The app still probes `http://localhost:5000/manifest` for a local data engine. If the local engine is not running, the browser logs one expected connection-refused error, then falls back to cloud data.
- Nuclear facilities are not a dataengine REST feed. The current plugin bundle includes embedded static GeoJSON from OSM and should not be treated as a failed cloud endpoint.
- Weather is configured through `OPENWEATHERMAP_API_KEY`. The local copy currently has a key in `.env`; production/cloud deployments must provide their own key through environment variables.

## Planned Follow-Up

- Refine the left icon cycler visuals if it feels too cryptic after real use.
- Add clearer "source degraded/fallback active" UI for aviation instead of silently using OpenSky.
- Make the aviation source configurable between WWV engine, OpenSky, and possibly another ADS-B provider.
- Add a small settings control for local source priority and polling interval.
- Add a visible weather status/diagnostic row in Settings so users can tell whether the OpenWeatherMap key is missing, invalid, or returning tiles.
- Decide whether local auth bypass should stay enabled by default in `.env` for this private fork, or be opt-in only for Windows/local scripts.
- Replace the local engine connection-refused console noise with a quieter probe or explicit Settings status.
- Investigate why dev cold compile still takes 10-20 seconds on first boot. Current behavior is acceptable after warmup but still rough.
- Revisit the right inspector for dense entity metadata once more real plugin detail components are surfaced.
- Clean up the remaining old CSS and component paths after the UI settles.
- Add targeted tests for the new `/api/aviation` normalizer and the Settings/main Plugins split.
- Add tests for auth-disabled local mode, favorites no-op behavior, and boot overlay fallback behavior.
- Consider moving screenshots/mockups out of git later if the repo should stay lean.

## Artifacts

Supporting mockups, screenshots, and the original transition notes were moved to:

`docs/local-ui-revamp/`
