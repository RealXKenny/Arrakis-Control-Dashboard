# Personal tasks (N094)

[Personal data controls (N099)](personal-data.md) provide a versioned export and separately confirmed erasure of the entire private task/project/goal list, including notes and completed entries. Erasure retains an empty revision fence to reject stale editors; normal per-entry editing remains here.

Open **More → Personal tasks** (`/tasks`). Create private tasks, personal project entries and personal goals with a title, notes, normal/high priority and an optional due date. No game guild or character link is required. Entries belong to the dashboard account, not its current linked pawn.

## Daily workflow

- Create or edit an entry and explicitly **Save entry**. Completion/reopening is manual, with server-owned creation/update/completion timestamps. Marking a task complete never verifies an achievement, grants XP, transfers resources or changes game state.
- Filter by open/completed status and task/project/goal type, or search titles and notes. Results sort by high priority, calendar due date and creation time. Due dates are calendar dates, not timed notifications or automatic deadlines.
- Link tasks to existing private project/goal entries. A planning link focuses that entry even if normal filters would hide it. Referenced plans cannot be deleted or changed to another kind until dependent links are edited or removed. Planning entries cannot link to each other, preventing cycles. Titles update through the referenced entry rather than stale copied labels.
- **Delete entry** requires a separate inline confirmation. Other entries are never automatically evicted. **Cancel editing** leaves the saved record unchanged. New/edit/delete controls prevent replacing an active editor accidentally. Reloading explicitly discards an open editor and reads the current saved list.

Projects and goals here are private planning entries within this task list. They are not the unimplemented N011 character milestone board or N051 guild project-budget system. No guild project API, achievement evidence or permissions are invented.

## Context links

**Plan a task** links on verified displayed base/vehicle cards and item-finder results prepare a draft, never save automatically. The draft captures the reference ID/search text, label and owned/shared view. Manual references are also supported. A reference is coordination metadata, not proof of ownership, current existence or delivery.

Item links open `/storage?find=<encoded name or template>` with the finder prefilled. No scan runs automatically; choose **Find items** to invoke the existing fresh, bounded N001 authorization and search pipeline. Asset links select the owned/shared tab and scroll to the matching card. Deleted or inaccessible assets remain absent under the destination's existing authorization. Safe context seeds are bounded and validated; unsupported IDs produce no context shortcut rather than a broken arbitrary URL.

Project/goal links use `/tasks?focus=<UUID>#task-<UUID>` and resolve only within the caller's saved record. Missing/foreign entries show an honest unavailable reference without exposing another account. Target URLs are constructed from a strict type allowlist; callers cannot store arbitrary URLs, provider endpoints, scripts, owner selectors or headers.

## Redis persistence and security

Records live at `arrakis:personal-tasks:v1:<SHA-256(account ID)>`, with schema version 1, a UUID revision and up to 100 entries (completed entries and plans count toward the limit). Titles allow 120 characters, notes 1,500, and the complete record is bounded to 256 KiB measured in UTF-8. Edits exceeding byte limits fail without truncating existing notes. Entries expire together after 90 days without reading or updating the list; the UI states this retention policy.

Single-key Lua reads and UUID compare-and-set writes work on standalone Redis and Cluster without multi-slot operations or database-selection commands. Concurrent first creates, edits, status changes and deletes have one winner. Empty lists retain a revision, preventing a stale tab from restoring deleted content. Corrupt, oversized, wrong-type and unknown-version storage fails closed instead of silently resetting notes. Schema validation also checks unique IDs, planning reference integrity and completion timestamps.

Every API call requires the existing fresh session; the owner comes only from that session, never query/body fields. Requests share a 30/account/minute budget that fails closed if protection storage is unavailable. Mutations require same-origin JSON and bounded bodies. Notes render as plain React text; no HTML/Markdown execution occurs. Game resource, guild and currency APIs are never mutated by task actions.

Client requests have a ten-second deadline and abort on unmount. Draft IDs remain stable through an uncertain save; writes never retry automatically. A stale revision returns 409 and keeps the draft. A failed/timed-out request keeps the draft and requires explicit reload before another attempt; a save may already have committed. No success is reported until a valid server record is received. Drafts are in memory and do not survive leaving/reloading the page. Saved tasks are private data, not source snapshots or a historical progression ledger.

## API

`GET /api/v2/tasks` returns `{ record: { schemaVersion: 1, revision, tasks } }`. Missing records return an empty list with null revision. Responses are no-store.

`POST /api/v2/tasks` accepts one strict action (16 KiB request bound):

| Action   | Additional fields                                            |
| -------- | ------------------------------------------------------------ |
| `save`   | `revision` (UUID or null), `task` draft                      |
| `status` | `revision` UUID, `id` UUID, `status` (`open` or `completed`) |
| `delete` | `revision` UUID, `id` UUID                                   |

Draft fields are `id`, `kind` (`task`, `project`, `goal`), `title`, `notes`, `priority`, nullable ISO calendar `dueDate`, and a typed `target`. Targets are `none`; `item` with bounded `ref`/`label`; `base`/`vehicle` with safe `ref`, `label`, `view`; or `project`/`goal` with a same-record UUID `ref`. Project/goal drafts cannot use planning targets. Caller-owned timestamps, status on a draft, owner claims, unknown fields and arbitrary link types are rejected.

Save responses return the confirmed whole record and next revision. Subsequent writes must use it. Missing status/delete IDs return 404; stale revisions, full lists and linked-plan conflicts return 409. Quota/validation failures leave the saved record unchanged.

## Deployment and verification

No dependency, environment variable, PostgreSQL or explicit data migration is added. Redis records initialize lazily. Code rollback can stop consuming these keys without modifying player/game records; inactivity retention removes unused data. Do not reset production task records for testing.

Run standard checks, production build/smoke and browser tests. Focused suites are `tests/unit/tasks/model.test.ts`, `tests/api/personal-tasks.test.ts`, `tests/browser/personal-tasks.spec.ts` and `tests/integration/redis-personal-tasks.test.ts`. Integration targets must be disposable because the harness flushes them. Real Redis checks cover privacy/retention, simultaneous creates/updates, timestamps, planning integrity/deletion, entry/UTF-8 limits and corrupt/wrong-type storage. Browser fixtures model CAS only; integration verifies actual Lua semantics.

Browser coverage includes solo/unlinked planning, project/goal links, completion/reopening, context drafts, asset navigation, explicit item search, account isolation, stale-tab recovery, failed-save draft retention, keyboard/touch controls, widths 320/393/412/768/1440 and automated WCAG AA. Native Safari, physical devices and screen-reader products remain unverified. [N095 privacy controls](privacy-center.md) are implemented separately; N096–N100 remain follow-up work on `feature/personalization`. No merge/deployment is authorized by this feature.

### Validation evidence (15 November 2026)

- Local unit/API/architecture: 1,663 passed; 32 existing Windows platform cases skipped. Formatting, typecheck, lint, documentation/AI checks, build and both production smoke suites passed.
- Complete Chromium browser rerun: all 193 tests passed. All four focused task workflows also passed after stabilizing screenshot capture with font/paint readiness.
- [Corrected implementation CI](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43750646840) includes standalone Redis coverage: 181 passed, four Cluster-only skips. All six personal-task storage cases passed, including blank/corrupt records and a Unicode edit exceeding the byte quota without data loss.
- [Six-node Redis Cluster](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43750641726) passed all 185 tests, including the same six personal-task cases and existing topology/failover checks.

The initial browser run exposed a base-text selector ambiguity from the new context link and an accessibility audit sampling a casino chip mid-fade. The assertion now targets the base heading, and the audit waits for fonts and finite animations to settle. No contrast assertions, route coverage or reduced-motion tests were removed. Planning-link focus now scrolls after saved entries load; blank existing Redis values fail closed rather than appearing to be missing lists.

Visually reviewed screenshots from the running application with disposable fixture data: [desktop task editor](../assets/screenshots/personal-tasks-desktop.png) and [mobile task editor](../assets/screenshots/personal-tasks-mobile.png). Final documentation/screenshot-commit CI is recorded in PR #11's checks/comments. No production player records were modified.
