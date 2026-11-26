# Customizable portal widgets (N091)

The portal at `/portal` supports private widget visibility, order and density. It reuses the existing field conditions, character, Solari credit, exchange, holdings, fleet, server rhythm and Landsraad panels. No additional provider endpoint or dependency is introduced.

## Defaults and customization

Without a saved layout, a character with no reported guild receives a compact personal briefing: field conditions, character, Solari credit, holdings and fleet. Guild members receive the existing eight-panel comfortable overview. Character-link failures still show the existing notice; personal metrics show unavailable rather than invented zeroes, while authenticated world panels and layout settings remain usable. Guild membership is not required to customize the portal.

Choose **Personal view** or **Full overview** to preview a preset. **Customize widgets** exposes visibility checkboxes, keyboard/touch **Move up/down** buttons and panel density. Changes preview immediately but persist only with **Save layout**. Hiding every widget is supported; the editor and preset controls remain available. **Discard changes** restores the last loaded layout. **Reset to recommended** previews the current recommended default, which must be saved. **Reload saved layout** explicitly discards the local preview and reads the latest saved revision.

Compact density reduces panel padding and suppresses character faction/rank rows. A character without a guild is presented as an independent traveller. A saved layout persists when navigating between briefing maps and remains attached to the dashboard account if the linked character changes. Density and widget visibility affect presentation, not authorization or the underlying bounded profile/world data loads. Hidden panels are not a security boundary.

## Persistence and API

`GET /api/v2/portal/layout` returns `{ record: null }` for an account without preferences, or a saved record. `POST` accepts only:

```json
{
  "revision": null,
  "layout": {
    "schemaVersion": 1,
    "density": "compact",
    "widgets": ["conditions", "character", "solaris", "holdings", "fleet"]
  }
}
```

After saving, send the returned UUID revision on the next write. Supported widget IDs are `conditions`, `character`, `solaris`, `exchange`, `holdings`, `fleet`, `population` and `landsraad`. Lists may contain zero through eight unique IDs. Arbitrary URLs, markup, ownership fields, unknown properties and unknown schema versions are rejected. Request and storage bounds are 4 KiB.

Records live at `arrakis:portal-layout:v1:<SHA-256(account ID)>`, containing only the revision and validated layout. Reads/writes refresh a 90-day inactivity expiry. The schema initializes lazily; there is no database migration or new environment variable. A single-key Lua comparison serializes updates on both standalone Redis and Cluster, including concurrent first saves. Empty layouts keep a revision, preventing stale tabs from restoring removed widgets. No multi-slot transaction or Redis database-selection command is used.

Both endpoints use the existing fresh-session boundary and no-store responses. Mutations require same origin and JSON content type. A 30-request/account/minute budget fails closed if rate-limit storage is unavailable. The account ID comes only from the authenticated session; no character/guild identity or browser ownership claim authorizes access.

## Failure handling

A stale revision returns `409`; unsaved choices remain visible until the member explicitly reloads or discards them. Corrupt, oversized or unavailable Redis records fail closed rather than silently resetting preferences. A settings outage during server rendering uses a visibly identified recommended layout and disables saving until settings can be reloaded. Character and world failures do not replace saved preferences.

Client requests have a ten-second deadline and abort on unmount. A timed-out save may already have committed: reload the saved layout before trying again. There are no automatic mutation retries. Temporary failures retain the draft instead of reporting optimistic success. Layout changes never mutate inventory, currency, guild membership or other game data.

## Implementation and verification

`features/portal/layout.ts` owns the allowlist, presets and schemas. `server/layout-store.ts` owns private persistence, and `server/layout-http.ts` owns API handlers. The portal server component retains authenticated data fetching and passes rendered panel slots into `PortalWidgets`; raw provider sections, credentials and server modules are not imported into its client module graph.

Run the standard formatting, type, lint and test checks, `npm run build`, `npm run test:production` and `npx playwright test tests/browser/portal-widgets.spec.ts`. The focused tests cover independent accounts, presets, empty/reset layouts, map/reload persistence, unlinked characters, conflicting tabs, failed saves, touch/keyboard access and WCAG automation. Real storage/retention/concurrency tests run through `npm run test:integration` with disposable standalone Redis or Redis Cluster. Integration setup flushes its configured test instance; never point it at production.

The browser fixture uses Chromium with touch emulation and widths 320, 393, 412, 768 and 1440px. It does not certify physical phones, native Safari or assistive-technology products. Browser preference fixtures model CAS responses; only the real Redis suite verifies Lua semantics.

### N091 validation evidence (15 November 2026)

- Formatting, TypeScript, lint, documentation links/formatting and assistant-adapter checks passed.
- The local unit/API/architecture run passed 1,641 tests; 32 existing platform-specific cases were skipped on Windows.
- The production build and both production smoke suites passed.
- The full Chromium browser run passed all 183 cases, including five dedicated portal-widget cases. These verify saved layouts, account isolation, empty/recommended presets, concurrent-tab conflicts, failed and timed-out saves, responsive layouts, keyboard/touch controls and automated WCAG AA checks.
- [Standalone Redis CI](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43742299185) passed 170 integration tests (four Cluster-only cases skipped), including all four new portal storage cases.
- [Six-node Redis Cluster validation](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43742301701) passed, including the same four portal storage cases against real Redis Lua operations.

The screenshots below were captured from the running application with disposable, sanitized browser fixtures and visually inspected. They show the compact personal preset at desktop and touch-mobile widths; fixture telemetry is not production player data.

[Desktop screenshot](../assets/screenshots/portal-widgets-solo-desktop.png) · [Mobile screenshot](../assets/screenshots/portal-widgets-solo-mobile.png)
