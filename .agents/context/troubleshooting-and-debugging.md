---
trigger: model_decision
description: Troubleshooting and debugging guidelines for WorldWideView, covering latency, logging, and namespace collisions.
---

# Troubleshooting and Debugging

## 1. Plugin Data Latency
If there is a noticeable delay (e.g., ~1 second) between enabling a plugin and the initial data arriving on the globe, **do not assume the UI is blocking**.
- **WebSocket Handshake**: Initial latency is often caused by the time it takes to establish a new WebSocket connection to the engine's `/stream`.
- **Upstream Cooldowns**: Plugins querying external providers (like OpenSky for `aviation`) have strict rate limits. If a snapshot returns a `404`, it might mean the seeder is in a cooldown period or hasn't successfully fetched data yet. This is expected behavior.
- **Diagnosis**: Instrument the `DataBusSubscriber` and `WsClient` with timing logs (`performance.now()`) to track exactly where the bottleneck occurs (manifest discovery vs connection establishment vs first payload).

## 2. Log Verbosity and Structured Logging
We employ a **structured logging strategy** in the frontend to reduce noise and improve readability.
- **Rule**: Do not add excessive `console.log` statements that dump raw JSON payloads or stream contents directly to the console in core files like `WsClient.ts` or `PluginManager.ts`.
- **Implementation**: If detailed logs are needed, use conditional debug levels or summarize the output (e.g., logging payload sizes or entity counts instead of the full object array). This ensures critical diagnostic information remains visible without overflowing the terminal.

## 3. Namespace Collisions
If a plugin fails to load in the Data Engine with a `404` or `Error [ERR_MODULE_NOT_FOUND]` error during startup:
- **Root Cause**: The seeder may exist simultaneously in both the `wwv-seeders-community` and `wwv-seeders-private` repositories. 
- **Resolution**: Seeders must have a unique namespace. Ensure that private plugins (e.g., `aviation`, `maritime`, `military-aviation`) are explicitly removed from the community repository to prevent workspace-level module resolution failures when the V2 engine attempts to load them. Private seeders take priority, but overlapping names will cause dependency conflicts.

## 4. Agent Execution Environments (Windows/PowerShell)
When an AI agent or developer is executing CLI commands via tools in this project on Windows:
- **Rule**: NEVER use the `&&` operator to chain commands in PowerShell. It will result in parser errors.
- **Resolution**: Use sequential execution, run commands separately, or use PowerShell-safe chaining like `; if ($?) { }`.

## 5. UTF-8 BOM in `package.json` Crashing Node Scripts
If `pnpm dev` (or any workspace script) dies with `SyntaxError: Unexpected token '', "{ ..." is not valid JSON`, the offending file has a UTF-8 BOM (`EF BB BF`) at byte 0.
- **Root Cause**: Windows PowerShell 5.1 `Set-Content -Encoding UTF8` and Notepad's "Save as UTF-8" both emit a BOM. Node's `fs.readFileSync(p, 'utf-8')` does NOT strip it, so `JSON.parse` rejects the leading `﻿`. pnpm/npm strip BOMs silently, which is why this only blows up in custom workspace scripts.
- **Diagnosis** (PowerShell):
  ```powershell
  Get-ChildItem local-plugins -Directory | ForEach-Object {
    $p = Join-Path $_.FullName 'package.json'
    if (Test-Path $p) {
      $b = [System.IO.File]::ReadAllBytes($p) | Select-Object -First 3
      if ($b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { $_.Name }
    }
  }
  ```
- **Fix at the seam (preferred)**: In any script that parses externally-authored JSON, strip the BOM before parsing. See `readJsonFile()` in [`scripts/sync-local-plugins.mjs`](../../scripts/sync-local-plugins.mjs) as the canonical helper:
  ```js
  let text = fs.readFileSync(filePath, "utf-8");
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return JSON.parse(text);
  ```
- **Clean existing files** (one-time): rewrite each file without its first 3 bytes via `[System.IO.File]::WriteAllBytes($p, $bytes[3..($bytes.Length - 1)])`.
- **Prevention**: When authoring files via PowerShell, use `Out-File -Encoding utf8NoBOM` (PS 7+) or `[System.IO.File]::WriteAllText($p, $text, [System.Text.UTF8Encoding]::new($false))` (any PS). Never edit `package.json` in Notepad.

## 6. Next.js vs. Undici Fetch Type Mismatches
When implementing SSRF protections (e.g., DNS IP Pinning via custom `Dispatcher`), you will likely use `undici.Agent`.
- **Root Cause**: Passing global Next.js `RequestInit` options directly into `undici.fetch` will throw strict TypeScript errors because the `BodyInit` and `RequestCache` signatures differ, and `dns.lookup` returns a generic `number` instead of exactly `4 | 6` for IP families.
- **Resolution**: Strip out Next.js specific keys, explicitly cast `body` as `any`, and explicitly type `resolvedFamily: number` when interfacing between Next.js request streams and the `undici` library.
