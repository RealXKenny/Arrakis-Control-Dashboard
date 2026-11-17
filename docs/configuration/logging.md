# Logging and the audit trail

## Application log

Written to the console (stdout/stderr) in colour, controlled by `LOG_LEVEL` (`DEBUG`, `INFO` default, `WARN`, `ERROR`, `FATAL`).
There are **no log files and no Sentry**. Details are recursively redacted for secret-looking keys before printing; operational
provider errors omit stacks. `DEBUG` adds redacted metadata and compact background-poll diagnostics; successful polling is
omitted at `INFO`, warnings and failures always show. Every request carries an `X-Request-ID` (a valid incoming one is kept,
otherwise a UUID) that appears in the logs and in legacy API error bodies as `requestId`.

Application lines use aligned timestamp, severity and service columns. Service names have distinct colors (including Redis
and Chat Bridge); warnings are amber and errors red. Timestamps use `YYYY-MM-DD HH:mm:ss` in America/New_York, with a
24-hour clock. Short metadata stays inline; longer details use wrapped `label = value` rows instead of raw JSON.
The startup banner and initial log include the dashboard's exact `package.json` version. Readiness reports elapsed
HTTP probe time, not total service initialization time. Individual Redis pool client configuration lines appear only
at `DEBUG`; `INFO` shows one pool summary. Nested fields retain their parent labels. Values, field counts and recursion are bounded, and
control characters are removed to prevent forged terminal lines. Set the standard `NO_COLOR` environment variable to disable
ANSI colors. Startup clears the console only on an interactive terminal; redirected logs retain earlier output.

Security audit console entries use the same readable layout: successful actions have a green INFO marker and refused or
failed actions an amber WARN marker. The AUDIT scope is blue. Details retain the exact event name, outcome, actor and audit
ID for correlation. Audit entries follow `AUDIT_LOG_STDOUT`, independently of `LOG_LEVEL`, and stay on stdout even for warnings.
Redis audit records and health/API payloads retain their structured formats. Log shippers that previously parsed
`AUDIT {json}` must adapt to the readable console format or read structured records through the administrator audit API.

Notable startup lines: `Starting dashboard`, `Runtime configuration validated`, `Redis pool configured for dashboard data`,
`Connecting to Dune Console`, `Production configuration is invalid; refusing to start`, `Dashboard startup failed` (Console warm-up only).

Under Pterodactyl, the panel console is the log. Under systemd use `journalctl -u <service>`. Ship stdout to storage you control.

## Audit trail

Security-relevant events are recorded by `src/lib/security/audit.ts`. Recording never throws and never blocks the action.

| Setting                    | Default | Effect                                                              |
| -------------------------- | ------- | ------------------------------------------------------------------- |
| `AUDIT_LOG_STDOUT`         | `true`  | Readable, colored AUDIT entries on stdout, independent of LOG_LEVEL |
| `AUDIT_LOG_REDIS`          | `true`  | Bounded sorted set `arrakis:{audit}:v1:events`                      |
| `AUDIT_LOG_RETENTION_DAYS` | `90`    | Redis entries older than this are trimmed on each write (1-3650)    |
| `AUDIT_LOG_MAX_ENTRIES`    | `10000` | Newest-N cap (100-1000000)                                          |

Stored event fields: `id`, `at` (ISO time), `event`, `outcome` (`success`, `failure`, `denied`), optional `actor` (numeric
Discord ID), `ip` (IPv4 or IPv6 `/64`), and flat `data`. Keys that look like secrets (`password`, `token`, `secret`, `cookie`,
`authorization`, `session`, `api key`, `credential`, `bearer`, `email`, `body`) are dropped, strings are capped at 200
characters, and nested data is flattened away.

See [audit logs](../features/audit-logs.md) for the event catalogue and how administrators read them.

## Retention guidance

The Redis copy is bounded and is **not** a durable archive. For compliance-grade retention ship the stdout lines to external
storage and set retention there ([monitoring](../administration/monitoring.md)).
