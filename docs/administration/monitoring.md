# Monitoring

The dashboard has no metrics endpoint, no Prometheus exporter and no built-in alerting. Monitoring means watching the process,
its logs, Redis and the Console from outside.

## What to watch

| Signal                                   | How                                                                                 | Alert when                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Process up                               | `GET /` returns 200 (any uptime monitor)                                             | non-200 or timeout                                |
| Readiness line                           | Console/log line `Arrakis Control Dashboard is listening` after each start           | missing after a restart                            |
| Fail-closed configuration                | Log line `Production configuration is invalid; refusing to start`; HTTP 500 on all pages | any occurrence                                  |
| Rate limiter storage                     | Audit event `security.control_failure`; HTTP 503 `RATE_LIMIT_UNAVAILABLE`            | any occurrence (Redis unreachable)                 |
| Failed sign-ins                          | Audit `auth.login_failed` (`reason` in `data`)                                       | many from one `ip`, or many `rate_limited`         |
| Administrator denials                    | `admin.access_denied`, `admin.reauth_required`                                       | bursts, or unknown actors                           |
| Rejected origins                         | `security.origin_rejected`                                                           | bursts (a probing client)                          |
| Administrator changes                    | `admin.operation`, `admin.sessions_revoked`                                          | outside expected change windows                     |
| Console reachability                     | Log lines `Provider network failure`, `Console API request failed`                   | repeated                                            |
| Overload                                 | HTTP 503 `SERVER_BUSY`                                                               | sustained                                           |
| Redis                                    | memory, evictions, connection errors, replication lag (Redis tooling)                | evictions > 0, memory near `maxmemory`              |
| Startup warnings                         | `REDIS_URL carries no password`, `unencrypted redis://`                              | present in production                               |

## Log shipping

Ship stdout (Pterodactyl console, `journalctl`, or your process manager's log) to external storage. Audit events are single lines
beginning `AUDIT ` followed by JSON; parse those separately. The Redis copy of the audit trail is bounded and is not an archive
([logging](../configuration/logging.md)).

## Health check script (example)

```bash
#!/usr/bin/env bash
set -euo pipefail
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://dashboard.example.com/)
[ "$code" = 200 ] || { echo "dashboard returned $code" >&2; exit 1; }
api=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://dashboard.example.com/api/v2/admin/overview)
[ "$api" = 401 ] || { echo "unexpected admin API status $api" >&2; exit 1; }
```

`401` on the admin API when signed out confirms authentication is enforced and the app is serving real routes.

## Performance

Compare latency and error rate with the previous release for a day after each update. Tune `API_MAX_CONCURRENCY` and
`API_GLOBAL_READ_LIMIT` only after load testing ([common issues](../troubleshooting/common-issues.md#performance)).
