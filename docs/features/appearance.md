# Appearance studio

Open the palette button in the desktop header or **Themes and custom colors** in the mobile menu. Signed-out visitors also have the header control. Appearance belongs to the browser/device, independently of accounts and server settings.

## Default and all 66 choices

The catalog matches [upstream PR #298](https://github.com/Red-Blink/dune-awakening-selfhost-docker/pull/298): **Default, 19 Console palettes, four faction palettes and 42 House/outfit swatches — 66 total**. Stable IDs, names and source colors are retained. As requested, Default now uses the Console's graphite page/panel surfaces (`#0d0f12` / `#171a1d`), warm text (`#f3efe7`) and copper accent (`#c68b4a`). It replaces the previous dashboard baseline; it does not copy Console backend behavior or its application layout.

Search names/descriptions/groups, filter a group, and choose compact swatch/name rows. The applied name remains visible while filtering. Arrow keys, Home/End and Enter follow visible row order. The native dialog wraps keyboard focus, closes with Escape/Done, restores the opener and keeps its header/footer visible while the library scrolls.

## Custom colors

The editor exposes eleven roles: background, panel, raised surface, primary/muted text, primary/secondary accents, border, success, warning and danger. Native color pickers and six-digit hex fields share a validated draft. Copy the applied palette into the editor, preview without saving, or explicitly apply custom colors. Closing discards an unsaved page preview. Readability protection fits surfaces and text; effective adjusted values are shown. Light custom palettes are supported.

Color export downloads `{version: 1, colors: {...}}` JSON. Import accepts at most 2 KiB, validates exact fields and loads a draft without applying it. Arbitrary CSS, URLs, scripts, alpha colors and unknown keys are rejected. Default clears selection, cache and custom colors. These browser settings have their own controls; N099 account-data export/deletion does not change a device's appearance.

## Shared helpers and persistence

`features/appearance/` owns the catalog, schemas, shared sRGB/contrast helpers, role engine, browser storage, nonce bootstrap and lazy picker. Tailwind utilities and feature CSS use the same color properties; there is no separate stylesheet/script per palette. Header/menu/widget/map chrome follows roles. Data-category colors, map markers, artwork and brand assets retain their meaning.

Versioned keys `arrakis-appearance-v1` and `arrakis-appearance-cache-v1` hold a preference and derived cache. Tabs follow storage changes. Blocked storage still permits a page-local selection with an honest warning. Other devices remain independent; users sharing a browser share its theme. There are no Redis records, API routes, environment variables, new dependencies or game writes.

A small synchronous root script restores a bounded validated cache before hydration using the existing per-request nonce. Property names are allowlisted; values are hex colors or bounded RGB triples. Invalid preferences, unknown IDs, stale versions, mismatched caches, oversized data and arbitrary property names are ignored. The lazy engine reconciles the bundled catalog. An invalid/missing cache can briefly show Default before reconciliation. Default does not need the lazy engine/picker bundle. Chunk/render failures have an isolated recovery notice and Default reset. Reloading can lose a page-local choice when storage is blocked.

Root composition passes callbacks into shared navigation; navigation does not import feature internals. No authentication, authorization, route inventory, CSP permissions or game-delivery settings are weakened.

## Verification and limits

Unit coverage checks all 66 entries, complete roles, preset/custom/hostile contrast, strict preferences, blocked storage, reset and hostile boot caches. Browser workflows apply all 66 choices, inspect computed colors, test filtering/keyboard/focus, preview/apply, real JSON download/import, cross-tab sync, blocked storage, no theme API calls and CSP nonce use. Light custom colors are checked across nine workspaces. Mobile/reduced-motion WCAG AA checks cover 320/393/412/768/1440 widths. Exact results are recorded in PR #11 comments.

Native Safari, physical devices and screen-reader products remain unverified. Existing open pages are not a cross-device preference stream. Cosmetic choices never grant source access. See [provenance](../legal/appearance-provenance.md) for upstream revisions and the separate swatch-data terms. No merge or deployment is authorized.

Reviewed running-app screenshots with disposable data: [Console default](../assets/screenshots/appearance-default-desktop.png), [desktop studio](../assets/screenshots/appearance-desktop.png), [mobile studio](../assets/screenshots/appearance-mobile.png).
