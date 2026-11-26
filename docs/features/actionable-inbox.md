# Actionable inbox (N092)

Open **Notifications → Actionable inbox** or `/inbox`. One view combines reported asset needs, supply follow-ups, operation briefings, scheduled community events and active queued restarts. Filter by category or urgent priority, then follow the action link to the source workspace. Refresh is explicit; there is no background polling or automatic game mutation.

## Sources and limits

| Source      | Available behavior                                                                                                                                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assets      | Reported base water at/below 10%, storage at/above 90%, vehicle condition at/below 20%, fuel at/below 10%. Zero readings are urgent. Container vehicles have no fuel alert. Missing values are unknown.                                                                     |
| Supply      | Freshly verified guild members see urgent open requests, their outstanding promises and reported deliveries they may review. A supplier cannot review their own delivery.                                                                                                   |
| Operations  | Freshly verified guild members see scheduled runs starting within 24 hours and runs currently in progress. Starts within one hour are urgent. Completed, cancelled and expired runs are excluded.                                                                           |
| Market      | N042 price-watch alerts appear in the [market planner](market-planner.md) when a member checks listings. The inbox does not read them yet, reports this source as unsupported and links to current market browsing; it never infers sales or price crossings from listings. |
| Events      | Published upcoming/open events starting within seven days, including the caller's own registration/waiting-list status when readable. Unscheduled, cancelled and expired events are excluded.                                                                               |
| Maintenance | Confirmed active Console restart entries for the next 24 hours and entries already restarting. Daily/IP-change schedules are not inferred from command output.                                                                                                              |
| Assistance  | Only the caller's own active help requests and volunteer assignments. Resolution stops the alert; private assistance chat content is never included.                                                                                                                        |

N021 generator monitoring and N025 personal stockpile thresholds are also unimplemented prerequisites. The inbox does not create them or fabricate their alerts. Current asset rules are fixed and displayed with each alert. [N093 notification preferences](notification-preferences.md) add category controls, quiet hours, cooldowns, dismiss and snooze.

At most 20 bases and 20 vehicles are inspected, plus the existing bounded 20 guild requests, 20 operations, 50 events and 20 restart entries. There are at most 120 deduplicated alerts after urgent-first ordering. Unknown readings or exceeded asset limits produce partial coverage. Public event and maintenance reads remain independent when private character/guild sources fail. An empty filtered list is never presented as an all-clear when sources are partial, unavailable, unlinked or unsupported.

## API and security

`GET /api/v2/inbox` returns `{ data: { checkedAt, alerts, sources } }` with a strict bounded schema and no-store responses. Caller-supplied owner/guild query parameters do not select another account. The authenticated session is the only account source, with six checks/account/minute and the existing profile read budget. Rate-limit storage failures fail closed.

Profile loading reuses the established account-scoped 15-second cache and authorization pipeline. A reported guild ID is only a candidate: private supply/operation records are read only after a fresh linked-character roster check and a canonical member ID. Failure of either storage source does not hide the other source's coverage. Provider errors, roster IDs and raw records never reach the browser. Alert IDs are hashed per account; action links are restricted to known same-origin workspaces. Destination pages enforce their own authorization.

This is a read-through inbox, not a historical alert archive. N093 persists only private notification settings and bounded control metadata, described in the linked notification guide; alert summaries and source snapshots are not retained. No environment variable or dependency is introduced. PostgreSQL is not used. Redis remains authoritative for guild sources, notification controls, sessions and request protection. Refreshing cannot pledge, confirm a receipt, join an operation, move inventory or change currency.

The client clears old readings before every refresh, on hiding the document and on navigation/unmount. Failed checks cannot leave old private cards visible. Requests abort on unmount/hiding and have a 45-second deadline. There are no automatic retries; filters survive failures. `checkedAt` is the inbox check time, not the exact sampling time of every upstream reading. Cached readings are non-atomic observations. [N098 freshness indicators](data-freshness.md) additionally show per-source `readAt` and scope-safe last-success metadata; failures clear private details, while safe timestamps remain within the current view.

## Verification

Run standard formatting, typecheck, lint and unit/API/architecture checks, a production build, production smoke and browser tests. Focused suites are `tests/unit/inbox/model.test.ts`, `tests/api/inbox.test.ts` and `tests/browser/inbox.spec.ts`. They cover thresholds/unknowns, bounds, safe links, supply review eligibility, operation deadlines, session isolation, fresh guild verification, source failures, filters, real API-to-fixture operation briefings, navigation, responsive widths and automated WCAG AA checks.

Browser fixtures use disposable data. Chromium viewport checks cover 320, 393, 412, 768 and 1440px; they do not certify native Safari, physical devices or screen-reader products. No production player data is changed.

On 15 November 2026, the local unit/API/architecture suite passed 1,649 tests with 32 existing Windows platform skips. The full browser suite passed all 186 cases; after the final card-order/copy and missing-source refinement, all eight inbox/portal cases passed again. The final production build, both smoke suites, typecheck, lint, formatting and documentation checks passed. [Implementation CI](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43744501656) passed all required checks, and the [six-node Redis Cluster workflow](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43744608328) passed on the combined branch. The PR checks record final-head verification.

Visually reviewed screenshots from the running application with disposable fixtures: [desktop](../assets/screenshots/actionable-inbox-desktop.png) and [mobile](../assets/screenshots/actionable-inbox-mobile.png). Action cards precede longer coverage notes so the first action remains visible on mobile.

## Shared personalization branch

N091–N100 are kept together on `feature/personalization`. N091 widget layouts, N092's available inbox sources, N093 notification controls, [N094 personal tasks](personal-tasks.md), [N095 voluntary-sharing privacy controls](privacy-center.md), [N096 mobile quick actions](mobile-quick-actions.md) [N097 command palette](command-palette.md) and [N098 data freshness](data-freshness.md) are implemented. [N099 personal data controls](personal-data.md) are implemented. [N100 saved activity views](activity-views.md) preserve named widgets, filters and planning references across the portal, inbox and tasks. All N091–N100 entries are implemented for the sources documented here. Keeping their work on one branch does not mark unimplemented backlog entries complete. Do not merge or deploy without authorization.
