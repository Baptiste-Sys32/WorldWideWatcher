# Plugin Source Audit

Date: 2026-05-22

## Summary

Gemini's dynamic-plugin audit correctly identified two rendering failures:

- Remote bundles such as Nuclear emit internal entity IDs like `nuclear`, while the installed registry ID is `nuclear-facilities`.
- Dynamic billboard icons call into Lucide React components; direct client-side `react-dom/server` usage breaks under React 19 / Next 16.

Those are fixed in the host by normalizing returned entity `pluginId`s and making SDK icon serialization browser-safe.

Additional local-dev issue found on 2026-05-22:

- `/api/marketplace/load` was vulnerable to a Turbopack/runtime failure from an eager `@sentry/nextjs` import in a startup-critical route. The route now logs validation failures locally instead of importing Sentry directly.
- `global-error.tsx` and instrumentation were also adjusted so Sentry is not eagerly loaded unless explicitly enabled.

## Current Source Status

Working cloud REST snapshots:

- `https://dataenginev2.worldwideview.dev/api/maritime`
- `https://dataenginev2.worldwideview.dev/api/military-aviation`
- `https://dataenginev2.worldwideview.dev/api/wildfire`
- `https://dataenginev2.worldwideview.dev/api/gps-jamming`
- `https://dataenginev2.worldwideview.dev/api/civil-unrest`
- `https://dataenginev2.worldwideview.dev/api/cyber-attacks`
- `https://dataenginev2.worldwideview.dev/api/conflict-events`
- `https://dataenginev2.worldwideview.dev/api/international-sanctions`
- `https://dataenginev2.worldwideview.dev/api/earthquakes`

Dead or intentionally unused cloud REST snapshots:

- `https://dataenginev2.worldwideview.dev/api/aviation` returns 404. The app uses local `/api/aviation` as the OpenSky fallback.
- `https://dataenginev2.worldwideview.dev/api/undersea-cables` returns 404. The undersea plugin reads local `/api/undersea-cables`, which proxies Submarine Cable Map and currently works.
- `https://dataenginev2.worldwideview.dev/api/air-defense` returns 404. This is not a live feed; the plugin renders static ADIZ polygons through `getGlobeComponent()` and intentionally returns zero entities.
- `https://dataenginev2.worldwideview.dev/api/nuclear-facilities` returns 404, but this is not the active source for the Nuclear plugin. `@worldwideview/wwv-plugin-nuclear@1.1.6` includes embedded static GeoJSON and emits entities client-side.

Legacy engine manifest IDs such as `civilUnrest`, `conflictEvents`, `gpsjam`, `sanctions`, and `wildfires` do not match the working REST snapshot paths. The working paths are the installed marketplace IDs listed above.

## Action

- Keep aviation and undersea as local/proxy-backed layers.
- Do not treat air-defense as a broken API source; it is a static overlay.
- Remove any future UI copy that reports these three as failed cloud feeds without explaining their local/static source.
- Weather overlay support was ported from upstream PR 153 using OpenWeatherMap tile proxy routes.
- Weather overlay was verified locally with the Clouds layer: tile requests through `/api/weather/tile/...` returned `200` and rendered on the globe.

## Camera Feed Follow-up

Checked on 2026-05-25:

- Added FL511 traffic cameras through Florida's public ArcGIS FeatureServer. It is an official no-key source with JSON/GeoJSON query support and snapshot image fields.
- Iowa DOT is a good next no-key candidate. Its official 511 data-feeds page lists CCTV metadata/video/images and no-credential ESRI feature services, but the service schema still needs a current field audit before wiring it.
- AZ511, FL511's developer REST API, and 511NY-style endpoints generally require developer keys; keep those behind optional env-var adapters if added.
- Road511 and OpenWebcamDB can broaden coverage, but both are key/tier/attribution based rather than pure no-key open feeds. Do not make them default-on without explicit product/legal review.
