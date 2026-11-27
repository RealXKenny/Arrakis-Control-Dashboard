# Caching and upstream requests

The dashboard keeps shared game and project data in Redis so that many members never mean many identical upstream requests. This page covers what is cached, for how long, what happens during outages, and what is never cached.

## Layers

| Layer                       | Where                            | Scope                        | Purpose                                                                    |
| --------------------------- | -------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| Shared cache                | `src/lib/cache/shared-cache.ts`  | Redis, every process/replica | Shared readings: status, counts, leaderboards, catalogs, map data, roadmap |
| Per-session read cache      | `src/server/api-read-cache.ts`   | Process memory, per session  | Short (30 s) de-duplication of a member's own Pages Router reads           |
| Dashboard snapshot provider | `src/lib/redis/data-provider.ts` | Redis                        | Portal world snapshot (unchanged)                                          |
| Browser read cache          | `src/lib/cache/client-cache.ts`  | Tab `sessionStorage`         | Instant back-navigation; bound to the session scope                        |

New shared data should use the shared cache. The other layers stay because they hold per-session or per-tab data.

## How the shared cache behaves

Each reading is stored as `{ data, fetchedAt, attemptedAt, failures }` under `arrakis:cache:v<version>:<family>:<sha256 of the key parts>`.

- **Fresh**: served straight from Redis.
- **Stale but retained**: served immediately, marked stale, and one background refresh starts (stale-while-revalidate).
- **Missing**: the request waits for one refresh.
- **Refresh failed**: the last good reading is kept with its original `fetchedAt`; only `attemptedAt` and `failures` change (stale-if-error, last known good). Each further failure doubles the wait before the next attempt, up to 15 minutes, so an outage does not mean one attempt per page view.
- **Invalid payload**: every policy validates the upstream response first. A malformed, truncated or partial response is rejected and never replaces good data. A legitimate empty result (for example no dungeon runs yet) is valid and cached.
- **Coordination**: an in-process single flight plus a Redis `SET NX PX` lock (one key, so it works on Redis Cluster) means one upstream request per key across all processes. Other callers get the existing reading or wait up to ten seconds for the refresh to land. Locks expire on their own after an interrupted refresh.
- **Bounds**: Redis TTL is the retention period, so nothing grows without limit; a reading over its byte limit (2 MiB by default) is served but not stored; the in-process fallback keeps at most 200 readings. Key parts are hashed and come from bounded sets (dungeon filters must match the board, for example).
- **Redis down**: reads fall back to process memory and one warning is logged at most every five minutes.
- **Metrics**: `sharedCacheMetrics()` reports hits, stale hits, misses, refreshes, failures, coalesced waits and lock waits per family.

Readings survive dashboard restarts because they live in Redis.

## What is cached

| Data                                                     | Family                                      | Fresh for                                     | Kept for |
| -------------------------------------------------------- | ------------------------------------------- | --------------------------------------------- | -------- |
| Online player count (status page, population recorder)   | `online-count`                              | 55 s                                          | 1 day    |
| Registered character total                               | `player-total`                              | 5 min                                         | 7 days   |
| Map markers, vehicles and online roster for the live map | `map-markers`, `vehicles`, `online-players` | 20 s                                          | 1 hour   |
| Hub roster for Arrakeen and Harko Village location       | `hub-players`                               | 15 s                                          | 2 min    |
| Harko Village points of interest                         | `hub-poi`                                   | 6 hours                                       | 7 days   |
| Restart history                                          | `restart-history`                           | 2 min                                         | 1 day    |
| Item catalog (season rewards)                            | `item-catalog`                              | 12 hours                                      | 7 days   |
| Dungeon records board                                    | `dungeon-board`                             | `DUNGEON_LEADERBOARD_REFRESH_SECONDS` (5 min) | 7 days   |
| Dungeon recent runs and personal bests                   | `dungeon-runs`, `dungeon-personal`          | same                                          | 1 day    |
| Solaris leaderboard                                      | `solaris-board`                             | 10 min                                        | 7 days   |
| Public roadmap                                           | `roadmap`                                   | `ROADMAP_REFRESH_SECONDS` (20 min)            | 30 days  |

Map readings are raw Console responses kept server-side; every request still applies the member's own filtering (own bases, accessible vehicles) before anything is returned.

## What stays live

Never served from a cache, because they need current authoritative state:

- authentication, sessions, guild-role re-verification and every permission check;
- linked-character resolution (Discord adapter) before any personal read;
- Solaris balances used for casino deposits, withdrawals and settlements;
- season reward eligibility, claims and delivery;
- guild membership checks and guild management actions;
- any Console write. Writes are never retried after an uncertain result.

## Invalidation

`invalidateShared(policy, keyParts)` removes one reading everywhere without touching any other key. Changing a stored shape bumps the family `version`, so old readings are ignored and expire. The roadmap uses conditional requests (`ETag`), so unchanged GitHub data costs a 304.

## Console failures and logging

`src/server/integrations/dunedocker/provider-health.ts` tracks Console and adapter health per process:

- A single failed read (timeout, network error, 5xx, 429) logs at `DEBUG`, because the cached reading covers it.
- After three failures spanning at least a minute, one `WARN` says the provider is unavailable and cached data is being served. While the outage lasts, a summary repeats at most every ten minutes.
- One `INFO` line reports recovery with the outage length.
- Failed writes always log a `WARN`.
- Routes in logs are normalised (ids become `:id`, no query strings); credentials and headers are never logged.

After five consecutive read failures a circuit breaker opens for 15 seconds (doubling up to five minutes while failures continue). While it is open, reads fail fast without a network request and callers fall back to cached readings. One probe is let through when the open period ends.

Reads time out after `DUNE_API_TIMEOUT_MS` (20 s by default). The health-observation worker caps its status probe at 10 s inside its 15 s budget; it previously used 5 s, which a cold Console status check could exceed and which produced the recurring `Provider network failure` warning. Safe reads retry at most twice with exponential backoff and jitter, and honour `Retry-After` up to ten seconds.

## Troubleshooting stale data

- A **Cached** or **Cached copy** badge means the last refresh failed; the time shown is when the data was actually retrieved.
- Check the console for `Provider unavailable` (Console) or `Shared cache storage unavailable` (Redis).
- Run with `LOG_LEVEL=DEBUG` to see individual failed reads and rejected payloads (`Upstream reading rejected by validation`).
- To force one reading to refresh, wait for its fresh period or delete its single Redis key; never flush the whole database.
