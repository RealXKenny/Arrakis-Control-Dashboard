# Moderator case workspace (N079)

Members can submit player reports at `/reports` with a 120-character subject, 1,000-character summary and 4,000-character text evidence. Intake is limited to three reports/account/hour. Reporters see only their own subject, summary, status, decision and timestamps; internal evidence/history, assignee details and other members' cases are not exposed.

`MODERATOR_DISCORD_ROLE_IDS` is required for `/moderation` and every case API. Current guild membership and role are verified directly with Discord on every privileged page, read and action. Missing, revoked, malformed or unverifiable authorization denies access before evidence is loaded. Moderator roles grant no backup, event-review, guild-leadership or other privileges, and no administrator workspace or `/api/admin/*` route exists.

## Cases and evidence

The queue supports direct `player-report` records and `assistance-abuse` cases derived from help-request reports. Derived cases become an immutable evidence snapshot on the first moderator action; the original assistance record remains separate. Case evidence contains only bounded text, never uploaded executables or arbitrary attachment URLs. Public assistance views continue to show only that a report exists, not its reporter/reason.

Moderators can filter by status/type, search text, assign a case to themselves, unassign it, record a confirmed/dismissed decision with a 10–2,000 character reason, and close resolved cases. No game enforcement, account sanction or Console mutation is performed.

Each case keeps at most 30 history entries with action, actor display name, timestamp and decision reason. Global security audit events also record report/case actions with the actor and case ID. Owner account IDs remain server-side and are omitted from moderator and reporter views.

## Storage, concurrency and retention

Cases live in one bounded Redis hash at `arrakis:{moderation}:cases`, capped at 200 records and 24 KiB each, with 90-day inactivity retention. Assignment/decision/closure use UUID compare-and-set and required lifecycle states. Concurrent decisions have one winner; stale revisions cannot overwrite newer evidence or decisions. No automatic mutation retries occur.

`GET/POST /api/v2/reports` provides session-owned intake/status. `GET /api/v2/moderation/cases` and `POST /api/v2/moderation/cases/[caseId]` require fresh moderator authorization, same-origin bounded JSON writes and 30 requests/account/minute. Responses are no-store and privileged errors do not include provider details.

Unit/API tests cover view privacy, fail-closed authorization and origin checks. Browser coverage exercises private intake, persistence, cross-member isolation, denied evidence loading, 390px layout and axe accessibility. `tests/integration/redis-moderation.test.ts` covers real standalone/Cluster assignment, concurrent decisions, closure, history, retention and derived evidence snapshots with a disposable target.
