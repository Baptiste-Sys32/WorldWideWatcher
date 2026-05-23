# Feed Audit (WorldWideView) — 2026-05-22

## Scope
Audited these feeds: Wildfires, Nuclear Facilities, Military Bases, Embassies, Volcanoes, Seaports, Lighthouses, Spaceports, Civil Unrest, Airports, Mineral Mines, Sanctions, CyberThreats, Conflict Events.

## Sources Checked
- Marketplace registry + plugin manifests (package + version).
- Published bundles on unpkg (bundle code paths, polling config, API paths).
- Data engine manifest and REST snapshots:
  - `https://dataenginev2.worldwideview.dev/manifest`
  - `https://dataenginev2.worldwideview.dev/api/*`
- Local repo for referenced static data files (e.g. `/data/*.geojson`).

## Summary (What’s new vs the previous audit)
- **Static GeoJSON feeds never emit data**: most static bundles load data in `initialize()` but never call `onDataUpdate`, and `getPollingInterval()` returns `0`, so the host never calls `fetch()`. Result: empty layers even though data is embedded.
- **Engine WS IDs don’t match registry IDs**: WS engine advertises camelCase/plural IDs (`wildfires`, `civilUnrest`, `conflictEvents`, `cyberAttacks`, `sanctions`). The client subscribes using kebab-case IDs (e.g., `conflict-events`), and the WS client only normalizes underscores → hyphens, so streaming data does not map to the active layers.
- **Schema mismatches**: `civil-unrest` and `conflict-events` expect `response.data`, but the live API responds with `items`. These return empty arrays.
- **Missing static file**: `mineral-mines` tries to load `/data/mineral_mines.geojson`, but no such file exists in the repo.
- **Sanctions endpoint mismatch**: `international-sanctions` calls `/api/sanctions` (404) while the live snapshot is `/api/international-sanctions` (200).

## Feed-by-Feed Findings
| Feed | Plugin (package@version) | Data Source | Status | Findings |
| --- | --- | --- | --- | --- |
| Wildfires | `wildfire` (`@worldwideview/wwv-plugin-wildfire@1.0.19`) | WS + REST fallback | ❌ | REST `/api/wildfire` returns 200, but `getPollingInterval()` is `0` so `fetch()` never runs. WS engine uses `wildfires` (plural) so subscriptions to `wildfire` never receive data. |
| Nuclear Facilities | `nuclear-facilities` (`@worldwideview/wwv-plugin-nuclear@1.1.6`) | Static embedded GeoJSON | ❌ | Bundle parses embedded GeoJSON in `initialize()` but never emits it. `getPollingInterval()` is `0` and no WS path exists. |
| Military Bases | `military-bases` (`@worldwideview/wwv-plugin-military-bases@1.1.6`) | Static embedded GeoJSON | ❌ | Same pattern: data loads into `_entities`, `fetch()` returns it, but polling is `0` so it is never called. |
| Embassies | `embassies` (`@worldwideview/wwv-plugin-embassies@1.1.4`) | Static embedded GeoJSON | ❌ | Embedded data + `fetch()` with polling `0`. No WS or REST. |
| Volcanoes | `volcanoes` (`@worldwideview/wwv-plugin-volcanoes@1.1.4`) | Static embedded GeoJSON | ❌ | Embedded data + `fetch()` with polling `0`. No WS or REST. |
| Seaports | `seaports` (`@worldwideview/wwv-plugin-seaports@1.1.4`) | Static embedded GeoJSON | ❌ | Embedded data + `fetch()` with polling `0`. No WS or REST. |
| Lighthouses | `lighthouses` (`@worldwideview/wwv-plugin-lighthouses@1.1.4`) | Static embedded GeoJSON | ❌ | Embedded data + `fetch()` with polling `0`. No WS or REST. |
| Spaceports | `spaceports` (`@worldwideview/wwv-plugin-spaceports@1.1.4`) | Static embedded GeoJSON | ❌ | Embedded data + `fetch()` with polling `0`. No WS or REST. |
| Civil Unrest | `civil-unrest` (`@worldwideview/wwv-plugin-civil-unrest@1.1.15`) | REST + WS | ❌ | Polling is **enabled** (900000 ms), but `fetch()` reads `response.data` while the API returns `items`, so it always returns empty. WS ID is `civilUnrest`, which does not map to `civil-unrest`. |
| Airports | `airports` (`@worldwideview/wwv-plugin-airports@1.1.3`) | Static embedded GeoJSON | ❌ | Embedded data + `fetch()` with polling `0`. No WS or REST. |
| Mineral Mines | `mineral-mines` (`@worldwideview/wwv-plugin-mineral-mines@1.0.10`) | Local GeoJSON file | ❌ | Plugin calls `load(\"/data/mineral_mines.geojson\")`, but the file does not exist in the repo. `fetch()` returns `[]` and polling is `0`. |
| Sanctions | `international-sanctions` (`@worldwideview/wwv-plugin-international-sanctions@1.1.16`) | WS + REST fallback | ❌ | REST path in bundle is `/api/sanctions` (404). Live snapshot is `/api/international-sanctions` (200). WS engine uses `sanctions`, not `international-sanctions`. |
| CyberThreats | `cyber-attacks` (`@worldwideview/wwv-plugin-cyber-attacks@2.0.17`) | WS + REST fallback | ❌ | REST `/api/cyber-attacks` is 200, but polling is `0` so `fetch()` never runs. WS engine uses `cyberAttacks`, which doesn’t map to `cyber-attacks`. |
| Conflict Events | `conflict-events` (`@worldwideview/wwv-plugin-conflict-events@1.0.18`) | REST + WS | ⚠️ | Polling is set to 24h and `fetch()` runs, but it expects `response.data` while the API returns `items`, so it returns empty. This explains the “flicker then disappear” (cached data briefly shows, then fetch replaces it with an empty set). WS engine uses `conflictEvents`, which doesn’t map to `conflict-events`. |

## Additional Feeds to Consider
- **Tropical cyclones / hurricanes** (NOAA NHC / JTWC).
- **Flood alerts & inundation** (GDACS / Global Flood Awareness System).
- **Drought & vegetation stress** (NASA MODIS / Copernicus).
- **Volcanic ash advisories** (VAAC).
- **Power grid outages** (regional ISO/RTO outage feeds where available).
- **Disease outbreak signals** (WHO / ProMED / HealthMap).

## 2026-05-23 Global Feeds Source List
- **Tropical Cyclones**: GDACS (global) + Meteo-France (France).
- **Flood Alerts**: GDACS (global) + Vigicrues (France).
- **Drought / Vegetation**: NASA/MODIS (global) + Propluvia (France).
- **Disease Outbreaks**: WHO (global) + Sante publique France (France).

## Known Fallback Behavior (Composite Feeds)
- If one source fails, the other source still returns items; diagnostics report which source failed.
- If both sources fail, the response returns `items: []` with diagnostics instead of throwing.
- Empty upstream feeds still return `items: []` and diagnostics so health can be inspected.

## Manual QA Checklist (Composite Feeds)
- Enable each global feed and confirm items render on the globe.
- Verify the feed response includes `sources` with `ok`, `count`, and latency values.
- Force one upstream to fail (e.g. block one URL) and confirm the other source still renders.
- Confirm empty feeds return `items: []` without client-side errors.

## 2026-05-23 App Improvements Completed
- Added first-party free/open feeds: wildfire hotspots, air quality stations, marine buoys, satellite constellations, and US weather alerts.
- Extended composite feed diagnostics so API responses expose source health and Plugin Doctor can show source status.
- Polished the search palette with higher-signal commands, result type labels, and clearer empty states.
- Replaced address lookup with OpenStreetMap/Nominatim-backed no-key routes, preserving smooth camera flight and the animated search pin.
- Tuned OSM 3D Buildings alignment to a `-120m` default and kept the advanced height offset slider available.
- Improved imagery picker preview resilience and kept Google 3D out of the normal picker unless configured.
- Made the top-nav Layers control a real toggle with active state, layer count, and health-warning badge.
- Added panel, timeline, and layer-list empty/overflow polish for narrower layouts.

## 2026-05-23 Verification Run
- `pnpm exec tsc --noEmit`
- `pnpm lint --quiet`
- `pnpm vitest run`
- `pnpm build`

## Follow-up Ideas
- Show an address lookup unavailable row when Nominatim fails or rate-limits.
- Add an explicit OpenStreetMap provider label to address results.
- Let Enter run a direct lookup when typed address text has no selected autocomplete row.
- Rename Building Height Offset to 3D Building Alignment and add a reset control.
- Gate or remove noisy UI debug logs in camera/intel actions.
