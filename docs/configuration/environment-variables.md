# Environment variables

Source of truth: `src/config/env.ts` (schema), `.env.example` (template). Values below are exact bounds from the schema.

## Required in production

Startup stops serving (HTTP 500 on every request, reason logged by variable name) if any of these is missing or malformed.

| Variable                  | Format / rule                                                    | Purpose                                                              |
| ------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `APP_URL`                 | URL, no credentials/hash/query/path; `https` unless loopback      | Canonical origin; OAuth callback is `<APP_URL>/api/auth/callback/discord` |
| `AUTH_SECRET`             | 32 to 256 characters                                              | Signs Auth.js state, seals stored Discord refresh tokens             |
| `DISCORD_CLIENT_ID`       | non-empty                                                         | Discord application                                                   |
| `DISCORD_CLIENT_SECRET`   | non-empty                                                         | Discord application secret                                            |
| `DISCORD_GUILD_ID`        | non-empty                                                         | Server whose members may sign in                                      |
| `VERIFIED_MEMBER_ROLE_ID` | non-empty                                                         | Role required for access                                               |
| `ADMIN_DISCORD_IDS`       | comma-separated numeric Discord user IDs (1 to 25 digits each)    | Who may use `/admin`; no built-in administrator in production         |
| `CONSOLE_URL`             | URL (`http` or `https`, no credentials)                           | Dune Console                                                           |
| `CONSOLE_API_KEY`         | non-empty                                                         | Bearer key for member features                                         |
| `ADAPTER_TOKEN`           | non-empty                                                         | Bearer token for the Console's Discord adapter                         |
| `REDIS_URL`               | `redis://` or `rediss://`, optional `/db`, no query/hash          | Redis (also supplies credentials in Cluster mode)                      |

## Optional

| Variable                         | Default                | Rule / meaning                                                                                       |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `SERVER_HOSTNAME`                | `127.0.0.1`            | Bind address (no whitespace). Use `0.0.0.0` in containers                                             |
| `SERVER_PORT`                    | `2008`                 | 1 to 65535 (Wings supplies it on Pterodactyl)                                                         |
| `LOG_LEVEL`                      | `INFO`                 | `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`                                                             |
| `API_MAX_CONCURRENCY`            | `100`                  | 1 to 10000 active API requests per worker; excess get 503 `SERVER_BUSY`                                |
| `API_GLOBAL_READ_LIMIT`          | `2400`                 | Reads per route per minute shared through Redis                                                        |
| `TRUSTED_PROXY_COUNT`            | `1`                    | 0 to 5 proxies in front of the app ([reverse proxy](../installation/reverse-proxy.md))                  |
| `ADMIN_REAUTH_HOURS`             | `12`                   | 1 to 168; step-up window for ordinary administrator changes                                             |
| `ADMIN_HIGH_RISK_REAUTH_MINUTES` | `60`                   | 5 to 1440; step-up window for high-risk operations                                                      |
| `ADMIN_CONSOLE_API_KEY`          | unset                  | Separate privileged Console key; administration is disabled while empty                                 |
| `OWNER_KEY_SECRET`               | derived from `AUTH_SECRET` | 32 to 256 characters; HMAC secret for marketplace owner keys. Set before publishing listings you keep   |
| `BOT_API_TOKEN`                  | unset                  | 32 to 256 characters; enables the read-only [bot API](../api/server.md#bot-world-summary)                |
| `REDIS_CLUSTER_NODES`            | unset                  | Comma-separated `host:port` (or `[ipv6]:port`) bootstrap nodes; selects Cluster mode                     |
| `REDIS_REQUIRE_TLS`              | `false`                | `true` makes production refuse a `redis://` URL                                                          |
| `REDIS_ALLOW_INSECURE`           | `false`                | `true` accepts plain-text, passwordless Redis on a public-looking host (do not)                          |
| `AUDIT_LOG_STDOUT`               | `true`                 | Print audit events as `AUDIT {json}` lines                                                               |
| `AUDIT_LOG_REDIS`                | `true`                 | Keep the bounded audit trail in Redis                                                                    |
| `AUDIT_LOG_RETENTION_DAYS`       | `90`                   | 1 to 3650                                                                                                |
| `AUDIT_LOG_MAX_ENTRIES`          | `10000`                | 100 to 1000000                                                                                           |
| `CHANGELOG_WEBHOOK_URL`          | unset                  | Discord webhook URL (validated); a secret                                                                |
| `CHANGELOG_AUTO_ANNOUNCE`        | `false`                | `true` announces each newly deployed release once                                                         |

Boolean variables accept only the strings `true` and `false`.

## Tool-only variables

| Variable                    | Used by                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `OWNER_KEY_PREVIOUS_SECRET` | `npm run marketplace:rekey` only, after rotating `OWNER_KEY_SECRET` ([migration](../deployment/migration.md)) |
| `TEST_REDIS_URL`, `TEST_REDIS_CLUSTER_NODES` | Redis integration tests only ([testing](../development/testing.md#redis-integration-tests))     |
| `ALLOW_UNVERIFIED_RELEASE`, `RELEASE_TAG` | Pterodactyl installer only ([Pterodactyl](../installation/pterodactyl.md))                  |
| `NEXT_TELEMETRY_DISABLED`   | Forced to `1` by the launcher, installer and egg                                                          |
| `NODE_ENV`                  | `development`, `test` or `production`. Set by the tooling (`npm run dev`, `npm start`, Vitest); do not set it yourself. Production enables the validation gate, `__Host-` cookies, HSTS and fail-closed behaviour |

## Production validation rules beyond presence

- `REDIS_URL` plain `redis://` with no password to a public-looking host is refused unless `REDIS_ALLOW_INSECURE=true`.
- `REDIS_REQUIRE_TLS=true` requires `rediss://`.
- `APP_URL` and `CONSOLE_URL` must not contain credentials or a fragment; `APP_URL` must have no query or path and must be
  `https` unless the host is `localhost`, `127.0.0.1` or `[::1]`.
- Warnings (not errors) are logged for plain-text Redis on a public-looking host, no Redis password, and `REDIS_CLUSTER_NODES`
  without a `rediss://` URL.

## Related

[Configuration examples](../reference/configuration-examples.md) · [Secrets management](../security/secrets-management.md) · [Security settings](../security/production-hardening.md)
