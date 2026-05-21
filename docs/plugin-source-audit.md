# Plugin Source Audit

Date: 2026-05-21

## Summary

Gemini's dynamic-plugin audit correctly identified two rendering failures:

- Remote bundles such as Nuclear emit internal entity IDs like `nuclear`, while the installed registry ID is `nuclear-facilities`.
- Dynamic billboard icons call into Lucide React components; direct client-side `react-dom/server` usage breaks under React 19 / Next 16.

Those are fixed in the host by normalizing returned entity `pluginId`s and making SDK icon serialization browser-safe.

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

Legacy engine manifest IDs such as `civilUnrest`, `conflictEvents`, `gpsjam`, `sanctions`, and `wildfires` do not match the working REST snapshot paths. The working paths are the installed marketplace IDs listed above.

## Action

- Keep aviation and undersea as local/proxy-backed layers.
- Do not treat air-defense as a broken API source; it is a static overlay.
- Remove any future UI copy that reports these three as failed cloud feeds without explaining their local/static source.
- Weather overlay support was ported from upstream PR 153 using OpenWeatherMap tile proxy routes.
