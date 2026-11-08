# API: rate limits

Authoritative table and tuning: [Rate limiting](../configuration/rate-limiting.md). Summary for API users:

| Endpoint group                          | Limit                                                  |
| --------------------------------------- | ------------------------------------------------------ |
| Legacy reads                            | 120/min per client address and route; 2400/min per route (`API_GLOBAL_READ_LIMIT`) |
| Legacy writes, `/auth/`, `/export`      | 30/min per client and route; 600/min per route          |
| V2 reads (marketplace item, map, …)     | 120/min per client; `API_GLOBAL_READ_LIMIT` global      |
| Marketplace upload                      | 10/hour per member                                       |
| Administrator operations                | 300/min per administrator                                |
| Announcements                           | 20/hour per administrator                                |
| Set password                            | 6 per 15 min per member                                  |
| Password sign-in                        | 10/email, 8/address+email, 40/address per 15 min         |
| Bot API                                 | 60/min                                                   |

## Response behaviour

- `429 RATE_LIMITED` with `Retry-After` (seconds). Legacy responses also include `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
- `503 SERVER_BUSY` with `Retry-After: 2` when `API_MAX_CONCURRENCY` is reached.
- `503 RATE_LIMIT_UNAVAILABLE` when Redis is unreachable in production (the limiter fails closed).
- Clients are identified by `X-Forwarded-For` as interpreted through `TRUSTED_PROXY_COUNT`; IPv6 clients share a `/64` bucket.

Back off exponentially on 429/503 and respect `Retry-After`.
