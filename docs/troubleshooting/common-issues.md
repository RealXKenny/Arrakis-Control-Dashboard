# Common issues

## Everything fails with HTTP 500 after a restart

Production configuration is invalid; see [startup errors](startup-errors.md).

## Mutations fail with `INVALID_ORIGIN` (403)

The request lacks an `Origin` header or it is not the `APP_URL` origin; or the proxy rewrites it. Set `APP_URL` to the exact public origin ([reverse proxy](../installation/reverse-proxy.md)).

## 401 everywhere after signing in

The cookie is not being stored or sent: `__Host-` cookies need HTTPS, path `/` and no `Domain`; check the proxy forwards `Cookie` and the browser accepts it.

## 403 `ADMIN_REAUTH_REQUIRED`

Sign in again; high-risk operations need a sign-in within `ADMIN_HIGH_RISK_REAUTH_MINUTES` (60), others within `ADMIN_REAUTH_HOURS` (12). New catalog operations are high risk by default
([administrator access](../configuration/administrator-access.md)).

## Marketplace upload refused

`USER_LIMIT` (25 listings), `STORAGE_LIMIT` (24 MiB), `MARKETPLACE_FULL`, `FILE_TOO_LARGE` (2 MiB), `THUMBNAIL_TOO_LARGE` (700 KiB), `RATE_LIMITED` (10/hour); a picture is required to publish an owned base ([marketplace](../features/marketplace.md)).

## Marketplace listings stopped belonging to their owners

`OWNER_KEY_SECRET` (or `AUTH_SECRET` when it is unset) changed. Restore it, or run the re-key tool with `OWNER_KEY_PREVIOUS_SECRET` ([migration](../deployment/migration.md)).

## Guild actions refused

`GUILD_LEADER_REQUIRED`: your linked character is not role 100 in the Console roster, or the roster could not be read. `GUILD_MEMBER_CHANGED`: refresh; the rank changed.

## Performance

| Symptom                              | Check                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Slow pages                           | Console latency (reads time out after 30 s); Redis latency; CPU on the host; software WebGL on the client      |
| 429 for ordinary users               | `TRUSTED_PROXY_COUNT` too low (shared bucket) or genuinely high traffic; raise `API_GLOBAL_READ_LIMIT` only after load tests |
| 503 `SERVER_BUSY`                    | `API_MAX_CONCURRENCY` reached; add capacity or raise carefully                                                  |
| High Console load                    | Many members are cache misses; keep Redis healthy so snapshots are shared                                      |
| 3D map/base preview slow             | Use the 2D fallback or a GPU-capable browser                                                                    |

One Pterodactyl container cannot be assumed to serve a very large community. Provision and test replicas, Redis throughput and failover, network egress and
provider quotas before a big launch (k6 script: `tests/load/dashboard.k6.js`).

## Still stuck

[Troubleshooting index](README.md#collecting-information-for-a-report) explains what to collect. Security problems: [SECURITY.md](../../SECURITY.md).
