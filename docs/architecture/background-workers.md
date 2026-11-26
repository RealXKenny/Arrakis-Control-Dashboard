# Background workers

The dashboard has no administrator interface. The few operations that used to need a person run as server-side background workers instead. Workers live in `src/server/workers/`, start from `src/instrumentation.ts`, are never imported by a route or page, and have no HTTP surface. A unit test enforces both.

## Execution boundaries

Every worker declares one responsibility and hard limits:

| Limit            | Behavior                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lease            | A Redis `SET NX PX` lease allows one instance at a time across a fleet (standalone or Cluster). It is released by compare-and-delete and expires on its own after a crash. |
| Timeout          | A run that exceeds its limit is abandoned and counted as a failure.                                                                                                        |
| Retry budget     | After five consecutive failures a worker backs off for 15 minutes; nothing runs during the cool-down.                                                                      |
| Interval         | Runs once a minute with a jittered start; a worker never overlaps itself.                                                                                                  |
| Health and audit | Each run writes a health record (`arrakis:{workers}:health:<name>`) and failures are written to the audit trail.                                                           |

Workers receive no input from players, hold no credentials beyond the server environment, and can neither approve nor grant anything that a player did not already request and record durably.

## Workers

| Worker                | Responsibility                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `seasons`             | Creates the default policy once, prepares, publishes and archives generated seasons through the existing compare-and-set path, and re-enables a policy the generator itself blocked after an hour. No game writes. |
| `casino-recovery`     | Finishes confirmed wallet steps, resumes transfers that were never sent, and parks interrupted ones. Never resends an unconfirmed Console adjustment.                                                              |
| `reward-recovery`     | Parks interrupted season reward sends as quarantined and clears resolved entries. Reads claim records only; never contacts the game.                                                                               |
| `health-observations` | Records one bounded, sanitized structured Console health observation per tick for the member-safe health timeline. Retains seven days and never changes Console or game state.                                     |

## Uncertain operations are quarantined

The Console offers no authoritative way to prove whether an unconfirmed Solaris adjustment or item grant happened: a balance comparison cannot exclude concurrent changes, and add-xp and task replies carry no receipt. Such an operation therefore stays in a durable `needs_reconciliation` (casino) or `uncertain` (rewards) state. It executes no further side effects, it is never retried, a withdrawal's funds stay reserved, and the full record is preserved. There is deliberately no screen or API to resolve it. Resolve it outside the dashboard, for example by inspecting the game database, and contact the maintainer to migrate the record if you need it cleared.

## Crash recovery

Every worker action is idempotent or a compare-and-set, so a restart, a Redis or Console outage, or a lost lease simply lets the next tick continue. A send marker is always written before a game call, so a crash can only leave a record that is parked as uncertain, never one that is silently resent.

## Removed

The administrator workspace, its APIs, `ADMIN_DISCORD_IDS`, step-up sign-in settings, the season builder and delivery queue, community event and changelog management screens, guild oversight and the administrator side of guild support chat were removed. Redis remains the only datastore; no PostgreSQL dependency was introduced.
