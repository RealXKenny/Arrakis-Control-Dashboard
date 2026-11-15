# Keyboard command palette (N097)

Signed-in members can open commands with **Ctrl+K** or **Command+K** outside editors. Desktop navigation also has an **Open command palette** button; phones and tablets have **Search navigation and assets** inside the mobile menu. Anonymous visitors have neither the trigger nor the shortcut.

## Navigation and keyboard behavior

Navigation searches labels, group names and descriptions from the existing permission-filtered route inventory. There is no second route catalog. Administrator destinations appear only when the server-rendered navigation identity has administrator visibility; every destination still performs its own current authorization. Visibility is a navigation hint, never a substitute for server access checks.

The palette focuses its search field, confines Tab/Shift+Tab to the modal and restores focus to the opener on dismissal. From the input, Down/Up focuses the first/last result. Result links support Up/Down, Home/End and native Enter activation; Tab remains available. Enter from navigation search opens the selected destination. Escape closes even a populated search field, rather than only clearing its native search control. Clicking the backdrop also dismisses it. Ctrl/Command+K does not steal keystrokes from inputs, textareas, selects, editable content or another dialog. It toggles an already-open palette.

Links disable prefetch. The existing `NavigationLink` preserves full document transitions into and out of Service status so its distinct CSP remains correct. Commands do not execute administration operations, game changes, reward grants or automatic sign-ups. No recent-command history, query history or asset cache is saved in the browser.

## Authorized asset lookup

Choose **Asset lookup**, enter 1–80 characters and explicitly **Search bases and vehicles**. Typing, opening the palette and changing modes do not call the provider. Names match case-insensitively; an exact supported numeric asset ID also matches. A separate **Find items: …** result opens the existing Storage finder with the query prepared; the member explicitly starts its inventory scan there.

`GET /api/v2/commands/assets?q=<query>` requires the existing verified API session. It rejects unknown query parameters, repeated `q`, owner selectors and arbitrary provider URLs. The session alone determines the account. A separate six-searches/account/minute limit fails closed if protection storage is unavailable; the existing provider read budget also applies. Responses use the shared no-store/security/error boundary.

The service reuses the item finder's fresh canonical pawn/controller resolver, then reads only the existing player-scoped `/api/players/{pawn}/bases` and `/api/players/{pawn}/vehicles` discovery endpoints. At most 20 rows per category enter consideration. Supported numeric IDs must be safe integers; unknown/invalid IDs and duplicate rows are excluded. Up to three workers check matched assets against the verified controller's exact canonical entry in `/api/bases/{id}/permissions` or `/api/vehicles/{id}/permissions`. Names, discovery rows and caller IDs cannot authorize access. Unsupported, unclaimed, noncanonical, missing, oversized or refused permission responses never produce a result.

Only authorized asset ID, bounded display name, kind, owned/shared access and a constructed workspace link are returned. No private permission rosters, character IDs, coordinates, inventory, quantities, world lists or administrator provider data are returned. Names are plain React text. The linked pawn/controller is resolved again before returning, and a changed link discards the result with 409. Destination workspaces independently check access again.

Discovery lists are bounded, not a promise of complete world search. An overlong/truncated list, failed source, unknown ID or permission exclusion sets `partial: true`. Empty partial results never claim there are no assets. Provider reads do not retry, use four-second individual deadlines and share a 12-second cancellation signal. Link resolution has its existing four-second deadline; the client has a 16-second deadline and aborts on cancellation, query/mode change or unmount. No automatic lookup retries occur. Errors are safe summaries, not raw provider responses.

Closing, navigating away or hiding the document closes the palette and drops readings. Query changes and new searches clear prior results immediately. A new open starts empty. The response is `{ checkedAt, partial, assets: [{ id, name, kind, access, href }] }`, with at most 40 results, sorted deterministically. `kind` is `base` or `vehicle`; `access` is `owned` or `shared`. Workspace URLs are allowlisted to the matching Holdings/Vehicle views and numeric anchors.

## Architecture and verification

`src/features/commands/` owns the browser-safe model, navigation composition, modal, lookup handler and server service. The root layout composes `CommandNavigation` around the existing `TopNavigation`; shared navigation only receives an opener callback and keeps its existing feature import boundaries. The palette mounts as a sibling to the header, avoiding map/preview transforms and nested drawer dialogs. Native modal semantics, explicit Tab wrapping, wrapping text and a bounded independently scrolling panel support small screens. No animation or disruptive sound is added.

No dependencies, environment variables, database migrations, persistent Redis records, workers or game writes are added. Redis remains the existing authoritative rate-limit/session backend. Rollback requires only the normal application update; there is no stored command data to migrate.

Focused tests are `tests/unit/commands/lookup.test.ts`, `tests/api/commands.test.ts` and `tests/browser/commands.spec.ts`. Coverage includes permission-filtered navigation, session ownership, unknown/repeated fields, rate-limit outages, canonical permissions, unsupported/truncated/duplicate discovery, changed links, cancellation, safe projections, no inventory/world reads, keyboard/focus behavior, editor protection, ordinary/admin/anonymous views, live fixture asset lookup, prepared item searches, failed reads, mobile entry and Service status CSP navigation. Real fixture lookup proves a restricted asset is excluded without resource writes.

Responsive browser checks cover widths 320/393/412/768/1440, touch, reduced motion, modal scrolling and automated WCAG AA. Visually reviewed running-app screenshots use disposable member data: [desktop palette](../assets/screenshots/commands-desktop.png) and [mobile palette](../assets/screenshots/commands-mobile.png). Native Safari, physical devices and screen-reader products remain unverified. This feature needs JavaScript; the ordinary dashboard navigation remains available without it.

Desktop regression coverage also checks 1840/1919/1920/1999/2000/2100/2159/2160/2399/2400/2560 pixels after local fonts load. The first complete browser run exposed a one-pixel topbar overflow at 1920 pixels after adding the command trigger. Tight gaps and compact controls/account presentation now remain through 2399 pixels; larger styling starts at 2400. Full navigation destinations still expand at 1920, with all existing menu and Service status assertions retained.

Run formatting, typecheck, lint, unit/API/architecture, production build/smoke, documentation and full browser checks. PR #11's stage/final verification comments record exact executed results and hosted standalone/Cluster regression status. N098–N100 remain follow-up work on `feature/personalization`; merging or deploying still requires authorization.
