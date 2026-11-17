# Saved activity views (N100)

Open **More → Activity views** (`/activity-views`) to create private named dashboard setups for building, exploration, logistics or your own activities. PR #8 defines N100 as saved dashboard views preserving filters, widgets and planning context. The implementation covers the existing portal, actionable inbox and personal task list without inventing new monitoring sources.

## What a view preserves

| Section          | Saved settings                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Portal           | Ordered widget allowlist, compact/comfortable density and Hagga Basin/Deep Desert briefing map |
| Inbox            | Alert category, urgent-only and show-muted filters                                             |
| Tasks            | Open/completed/all status, entry type and a bounded text search                                |
| Planning context | Optional same-account project or goal reference; no copied task notes                          |

Views contain configuration, not game observations, inventory, location telemetry, task completion evidence, notification preferences or unsaved editor content. Existing workspaces check their source permissions again. Choosing widgets never grants access to restricted data. No game API mutations or background monitoring are added.

## Create, capture and use

Create a named setup in the editor, choose widgets with checkboxes, and use **Up/Down** to order them. Personal/all-widget presets are available. Configure filters and optionally select an existing project or goal. Save explicitly. The manager supports editing/renaming, duplication as an unsaved draft and separately confirmed deletion. Names are unique ignoring case, at most 60 characters; an account can keep twelve views.

**Save current settings as activity** on the portal, inbox or tasks captures that workspace's current filters/widgets. With an activity open, the other sections retain its saved definition; normal workspaces use documented defaults for other sections. Choose a unique name to create a new view. Capturing never copies an open task editor or provider readings. Use the manager to customize the other sections or update an existing setup.

Each saved card opens its portal, inbox or tasks. An activity banner links those three workspaces with one opaque UUID query parameter. Names and private search text are not placed in the URL. A view is selected per page/tab, not as an account-wide active setting. Reopening or refreshing restores the saved definition. Local filter/widget edits are previews until captured or edited and saved in the manager. Activity-mode portal controls cannot overwrite the normal N091 layout. **Open normal portal/inbox/tasks** exits the activity.

Selecting a view reads its definition from the signed-in account on each navigation. Missing, deleted, invalid or another account's IDs show an explicit unavailable state; the activity workspace is not silently replaced with default settings. Storage outages similarly block application. Previously opened pages can retain their in-memory definition; there is no live revocation stream.

## Planning integrity

The API returns only owned project/goal IDs, kinds and titles as editor options, not their notes. Saving a non-null context rechecks that its ID and kind exist in the current owner's task list. If planning storage is unavailable, the editor reports that honestly; views without context can still be saved. Context and view records are separate scopes, so checking a plan and saving a view is not a cross-key transaction.

Activity tasks show the selected project/goal and directly linked tasks, intersected with saved filters. The task reader checks the context again. A deleted/retyped/missing plan yields an explicit empty state, never a broadened list of unrelated plans. There is no project/goal copy or resurrection. N099 task erasure can leave a dangling UUID in a view; choose a new context or none in the editor. Deleting a view does not delete its tasks.

## Persistence and API

`features/activity-views/` owns versioned strict schemas, UI, resolution and persistence. Thin entries are `/activity-views` and `/api/v2/activity-views`. Redis is authoritative; no migration, dependency or environment variable is added. One SHA-256 owner-keyed record stores at most twelve definitions in 32 KiB, with 90-day inactivity retention refreshed on reads/changes. The schema is version 1. No global active-view key, snapshot cache or cross-slot operation is used.

| Method | Route                    | Contract                                                                                  |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------- |
| GET    | `/api/v2/activity-views` | `{record, plans, planningAvailable}` for the verified session owner                       |
| POST   | `/api/v2/activity-views` | `{action: "save", revision, view}` or `{action: "delete", revision, id, confirmed: true}` |

Writes use JSON bodies bounded to 8 KiB, strict allowlists, the existing same-origin and session checks, no-store responses and a fail-closed twenty-request/account/minute budget. Owner selectors, arbitrary URLs, unsupported widgets and provider payloads are rejected. Audits contain actor/action only, not names, searches or plan text.

Single-key Lua UUID compare-and-set serializes edits/deletes across instances and supports standalone Redis and Cluster. Corrupt, empty, oversized or wrong-type records fail closed without overwrite. Conflicts, timeouts and uncertain saves preserve the draft and require an explicit reload; mutations never retry automatically. Reloading is explicitly labeled as discarding a draft. A timed-out save may have committed.

## Export, erasure and retention

[Personal data controls](personal-data.md) include `views` as a third independent scope. Exports preserve view definitions; erasure clears them while retaining a new empty revision fence, using the same 90-day inactivity TTL. Old editors/replayed deletes cannot overwrite newer definitions. Task notes, normal layouts and notification preferences remain separate. Existing version-1 task/sharing exports remain valid subsets; no import/restore endpoint is introduced.

Content deletion is not deletion of account/security/shared/game records or of copies already downloaded/opened/in flight. Empty revision metadata eventually expires; there is no permanent tombstone. Normal inactive view records also expire after 90 days. Never use production data for acceptance tests.

## Verification and troubleshooting

Run formatting, typecheck, lint, `npm test`, production build/smoke, browser tests and documentation checks. Focused suites are `tests/unit/activity-views/model.test.ts`, `tests/api/activity-views.test.ts`, `tests/browser/activity-views.spec.ts` and `tests/integration/redis-activity-views.test.ts`. Integration uses disposable loopback standalone/Cluster targets and flushes them. Browser fixtures model CAS; real Redis tests execute the actual Lua.

Coverage includes creation through the editor, cross-workspace restoration, capture, duplication, confirmation, stale/conflicting writes, account isolation, context deletion, separate export/erasure, limits, corruption and concurrency. Responsive checks cover 320/393/412/768/1440 widths, touch, keyboard and reduced motion with automated WCAG AA. Running-app screenshots: [desktop](../assets/screenshots/activity-views-desktop.png), [mobile](../assets/screenshots/activity-views-mobile.png). Exact executed results are recorded in PR #11 comments. Native Safari, physical devices and screen-reader products remain unverified.

If a view cannot open, confirm you are signed into its owner account and reload the manager. Do not assume an unreadable record is empty. If a context disappeared, choose a current project/goal or remove the context. On an uncertain save, reload and inspect the saved list before attempting another mutation. No merge or deployment is authorized by this feature.
