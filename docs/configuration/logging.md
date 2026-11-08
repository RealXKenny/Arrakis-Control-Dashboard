# Logging and the audit trail

## Application log

Written to the console (stdout/stderr) in colour, controlled by `LOG_LEVEL` (`DEBUG`, `INFO` default, `WARN`, `ERROR`, `FATAL`).
There are **no log files and no Sentry**. Details are recursively redacted for secret-looking keys before printing; operational
provider errors omit stacks. `DEBUG` adds redacted metadata and compact background-poll diagnostics; successful polling is
omitted at `INFO`, warnings and failures always show. Every request carries an `X-Request-ID` (a valid incoming one is kept,
otherwise a UUID) that appears in the logs and in legacy API error bodies as `requestId`.

Notable startup lines: `Starting dashboard`, `Runtime configuration validated`, `Redis pool configured for dashboard data`,
`Connecting to Dune Console`, `Production configuration is invalid; refusing to start`, `Dashboard startup failed` (Console warm-up only).

Under Pterodactyl, the panel console is the log. Under systemd use `journalctl -u <service>`. Ship stdout to storage you control.

## Audit trail

Security-relevant events are recorded by `src/lib/security/audit.ts`. Recording never throws and never blocks the action.

| Setting                    | Default | Effect                                                                  |
| -------------------------- | ------- | ----------------------------------------------------------------------- |
| `AUDIT_LOG_STDOUT`         | `true`  | One `AUDIT {json}` line per event on stdout (for log shipping)            |
| `AUDIT_LOG_REDIS`          | `true`  | Bounded sorted set `arrakis:{audit}:v1:events`                            |
| `AUDIT_LOG_RETENTION_DAYS` | `90`    | Redis entries older than this are trimmed on each write (1-3650)           |
| `AUDIT_LOG_MAX_ENTRIES`    | `10000` | Newest-N cap (100-1000000)                                                |

Stored event fields: `id`, `at` (ISO time), `event`, `outcome` (`success`, `failure`, `denied`), optional `actor` (numeric
Discord ID), `ip` (IPv4 or IPv6 `/64`), and flat `data`. Keys that look like secrets (`password`, `token`, `secret`, `cookie`,
`authorization`, `session`, `api key`, `credential`, `bearer`, `email`, `body`) are dropped, strings are capped at 200
characters, and nested data is flattened away.

See [audit logs](../features/audit-logs.md) for the event catalogue and how administrators read them.

## Retention guidance

The Redis copy is bounded and is **not** a durable archive. For compliance-grade retention ship the stdout lines to external
storage and set retention there ([monitoring](../administration/monitoring.md)).
