# Rate limiting

## Overview

Limits are fixed-window counters in Redis (`arrakis:rate:<sha256(key:window)>`, atomic `INCR` with `PEXPIRE`, so a lost expiry is
repaired). Client addresses come from `X-Forwarded-For` according to `TRUSTED_PROXY_COUNT` ([reverse proxy](../installation/reverse-proxy.md#trusted_proxy_count));
IPv6 clients are keyed by `/64`. Raw keys are never stored. In production, if Redis is unavailable the limiter **fails closed**
(`RATE_LIMIT_UNAVAILABLE`, 503) and emits `security.control_failure` (at most once a minute). In development it falls back to memory.

## Limits that exist in the code

| Scope                                   | Limit                                                          | Tunable                          | Response                    |
| --------------------------------------- | -------------------------------------------------------------- | -------------------------------- | --------------------------- |
| Legacy API (`/api/*` Pages routes), reads | 120 / min per client address and route; 2400 / min per route shared | `API_GLOBAL_READ_LIMIT` (global)  | 429 `RATE_LIMITED`           |
| Legacy API, writes / `/auth/` / `/export` | 30 / min per client and route; 600 / min per route shared     | no                               | 429 `RATE_LIMITED`           |
| V2 read routes                          | 120 / min per client address; `API_GLOBAL_READ_LIMIT` / min global | `API_GLOBAL_READ_LIMIT`           | 429 `RATE_LIMITED`           |
| Concurrent API requests                 | `API_MAX_CONCURRENCY` (default 100) per worker                 | `API_MAX_CONCURRENCY`            | 503 `SERVER_BUSY`, `Retry-After: 2` |
| Password sign-in                        | 10 / 15 min per email; 8 / 15 min per address+email; 40 / 15 min per address | no                        | sign-in refused (`rate_limited`) |
| Set password                            | 6 / 15 min per member                                           | no                               | 429 `RATE_LIMITED`           |
| Marketplace upload                      | 10 / hour per member                                            | no                               | 429 `RATE_LIMITED`           |
| Release announcement                    | 20 / hour per administrator                                     | no                               | 429 `RATE_LIMITED`           |
| Administrator operations                | 300 / min per administrator                                     | no                               | 429 `RATE_LIMITED`           |
| Bot API `GET /api/v1/bot/world`         | 60 / min (shared)                                               | no                               | 429 `RATE_LIMITED`, `Retry-After` |

Legacy responses carry `X-RateLimit-Limit` (30 or 120), `X-RateLimit-Remaining` and, when limited, `Retry-After`.
Additional product limits (not request limits): marketplace 25 listings and 24 MiB per member, 500 listings and 256 MiB total;
guild applications 200 per guild; chats 100 messages of 1000 characters.

## Tuning

Only `API_GLOBAL_READ_LIMIT` and `API_MAX_CONCURRENCY` are variables. Other numbers are constants in the code; changing them is
a code change that needs review and tests. Raise limits only after load testing ([troubleshooting performance](../troubleshooting/common-issues.md#performance)).

## Troubleshooting

| Symptom                                         | Cause                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Everyone is rate limited together               | `TRUSTED_PROXY_COUNT` too low (all clients share the proxy's address)                    |
| 503 `RATE_LIMIT_UNAVAILABLE`                    | Redis unreachable in production                                                          |
| 503 `SERVER_BUSY`                               | `API_MAX_CONCURRENCY` reached; slow Console or load                                       |
| A member cannot sign in with a password        | Per-email budget exhausted; wait up to 15 minutes or use Discord sign-in                  |
