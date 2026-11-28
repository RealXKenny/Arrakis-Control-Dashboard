# Environment variables

Source of truth: `src/config/env.ts` (schema), `.env.example` (template). Values below are exact bounds from the schema.

## Required in production

Startup stops serving (HTTP 500 on every request, reason logged by variable name) if any of these is missing or malformed.

| Variable                          | Format / rule                                                | Purpose                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                         | URL, no credentials/hash/query/path; `https` unless loopback | Canonical origin; OAuth callback is `<APP_URL>/api/auth/callback/discord`                                                                                        |
| `AUTH_SECRET`                     | 32 to 256 characters                                         | Signs Auth.js state, seals stored Discord refresh tokens                                                                                                         |
| `DISCORD_CLIENT_ID`               | non-empty                                                    | Discord application                                                                                                                                              |
| `DISCORD_CLIENT_SECRET`           | non-empty                                                    | Discord application secret                                                                                                                                       |
| `DISCORD_GUILD_ID`                | non-empty                                                    | Server whose members may sign in                                                                                                                                 |
| `VERIFIED_MEMBER_ROLE_ID`         | non-empty                                                    | Role required for access                                                                                                                                         |
| `MODERATOR_DISCORD_ROLE_IDS`      | optional, comma-separated Discord role IDs                   | Reserved for moderation authorization in the configured Discord guild; requires bot access to guild members. Grants access only to the moderator case workspace. |
| `EVENT_REVIEWER_DISCORD_ROLE_IDS` | optional, comma-separated Discord role IDs                   | Separate roles for event-submission review and confirmed judging; requires bot access to guild members. Grants no moderation or backup access.                   |
| `BACKUP_VIEWER_DISCORD_ROLE_IDS`  | optional, comma-separated Discord role IDs                   | Separate roles for sanitized backup status; requires bot access to guild members and a Console key with the required read scope.                                 |
| `DUNE_API_URL`                    | URL (`http` or `https`, no credentials)                      | Dune Console                                                                                                                                                     |
| `DUNE_API_KEY`                    | non-empty                                                    | Console credential for reads, administration and season delivery                                                                                                 |
| `DUNE_ADAPTER_TOKEN`              | non-empty                                                    | Bearer token for the Console's Discord adapter (the Discord side); never `DUNE_API_KEY`                                                                          |
| `REDIS_URL`                       | `redis://` or `rediss://`, optional `/db`, no query/hash     | Redis (also supplies credentials in Cluster mode)                                                                                                                |

## Optional

| Variable                              | Default                    | Rule / meaning                                                                                                                                                                                             |
| ------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SERVER_HOSTNAME`                     | `127.0.0.1`                | Bind address (no whitespace). Use `0.0.0.0` in containers                                                                                                                                                  |
| `SERVER_PORT`                         | `2008`                     | 1 to 65535 (Wings supplies it on Pterodactyl)                                                                                                                                                              |
| `LOG_LEVEL`                           | `INFO`                     | `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`                                                                                                                                                                  |
| `LOG_COLOR`                           | `auto`                     | `auto` (terminal or Pterodactyl), `always`, `never`. `NO_COLOR` also turns colours off                                                                                                                     |
| `API_MAX_CONCURRENCY`                 | `100`                      | 1 to 10000 active API requests per worker; excess get 503 `SERVER_BUSY`                                                                                                                                    |
| `API_GLOBAL_READ_LIMIT`               | `2400`                     | Reads per route per minute shared through Redis                                                                                                                                                            |
| `TRUSTED_PROXY_COUNT`                 | `1`                        | 0 to 5 proxies in front of the app ([reverse proxy](../installation/reverse-proxy.md))                                                                                                                     |
| `OWNER_KEY_SECRET`                    | derived from `AUTH_SECRET` | 32 to 256 characters; HMAC secret for marketplace owner keys. Set before publishing listings you keep                                                                                                      |
| `BOT_API_TOKEN`                       | unset                      | 32 to 256 characters; enables the read-only [bot API](../api/server.md#bot-world-summary)                                                                                                                  |
| `DUNE_API_TIMEOUT_MS`                 | `20000`                    | 1000 to 120000; default Console read timeout. Writes keep 30 s; health probes cap at 10 s                                                                                                                  |
| `DUNGEON_LEADERBOARD_REFRESH_SECONDS` | `300`                      | 60 to 3600; how long a shared [dungeon leaderboard](../features/dungeon-leaderboard.md) reading is fresh                                                                                                   |
| `SOLARIS_WEEKLY_PRIZES`               | (empty)                    | Up to ten comma-separated whole amounts, the Solaris paid to places 1, 2, 3… of the [weekly Solaris leaderboard](../features/solaris-leaderboard.md#weekly-leaderboard-and-prizes); empty turns prizes off |
| `ROADMAP_REPOSITORIES`                | both Arrakis repositories  | Up to five comma-separated public `owner/repo` names the [roadmap](../features/roadmap.md) reads                                                                                                           |
| `ROADMAP_LABEL`                       | `roadmap`                  | Label that approves an issue for the public roadmap                                                                                                                                                        |
| `ROADMAP_REFRESH_SECONDS`             | `1200`                     | 300 to 86400; how long the shared roadmap reading is fresh                                                                                                                                                 |
| `ROADMAP_GITHUB_TOKEN`                | unset                      | Optional read-only GitHub token (public repository read only). Raises the anonymous rate limit                                                                                                             |
| `UPDATE_WEBHOOK_SECRET`               | unset                      | 32 to 256 characters; enables the signed GitHub release webhook for [instant updates](../deployment/automatic-updates.md#instant-updates)                                                                  |
| `REDIS_CLUSTER_NODES`                 | unset                      | Comma-separated `host:port` (or `[ipv6]:port`) bootstrap nodes; selects Cluster mode                                                                                                                       |
| `REDIS_REQUIRE_TLS`                   | `false`                    | `true` makes production refuse a `redis://` URL                                                                                                                                                            |
| `REDIS_ALLOW_INSECURE`                | `false`                    | `true` accepts plain-text, passwordless Redis on a public-looking host (do not)                                                                                                                            |
| `AUDIT_LOG_STDOUT`                    | `true`                     | Print readable, colored AUDIT entries independently of LOG_LEVEL                                                                                                                                           |
| `AUDIT_LOG_REDIS`                     | `true`                     | Keep the bounded audit trail in Redis                                                                                                                                                                      |
| `AUDIT_LOG_RETENTION_DAYS`            | `90`                       | 1 to 3650                                                                                                                                                                                                  |
| `AUDIT_LOG_MAX_ENTRIES`               | `10000`                    | 100 to 1000000                                                                                                                                                                                             |
| `DISCORD_BOT_TOKEN`                   | unset                      | Shared main Discord bot token; server-only secret, no webhook or second bot process                                                                                                                        |
| `COMMUNITY_EVENTS_CHANNEL_ID`         | unset                      | Text/announcement channel ID for automatic community event containers (15–25 digits)                                                                                                                       |

### Live game chat (optional)

When `CHAT_ENABLED=true`, production also requires `RABBITMQ_URL`, `CHAT_BRIDGE_FUNCOM_ID`, and `CHAT_SERVERS`. The full protocol, deployment, and security guide is [Live game chat](../features/live-chat.md).

| Variable                                                                  | Default                     | Rule / meaning                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CASINO_SOLARIS_ENABLED`                                                  | `false`                     | Server-enforced gate for The Solaris Exchange: while `false`, every real Solaris deposit, withdrawal and wager is refused |
| `CASINO_MAX_WAGER`                                                        | `10000`                     | Largest single wager, in whole Solaris                                                                                    |
| `CASINO_MAX_PAYOUT`                                                       | `1000000`                   | Largest payout of one round, in whole Solaris                                                                             |
| `POKER_ACTIVITY_ENABLED`                                                  | `false`                     | Enables the play-money poker Discord Activity at `/activity/poker` and `/api/v2/poker/*`; see the poker Activity guide    |
| `CHAT_ENABLED`                                                            | `false`                     | Enables Live Chat and the launcher-supervised Chat Bridge                                                                 |
| `RABBITMQ_URL`                                                            | unset                       | Game `amqp://` or `amqps://` URL with host, 16-hex persona username, and password                                         |
| `CHAT_BRIDGE_FUNCOM_ID`                                                   | unset                       | Synthetic Funcom sender identity, 1 to 200 characters without controls                                                    |
| `CHAT_DISCORD_BOT_FUNCOM_ID`                                              | unset                       | Exact trusted Discord bot Funcom ID; together with `[Discord]` identifies relays, quote values containing `#`             |
| `CHAT_BRIDGE_DISPLAY_NAME`                                                | unset                       | Optional native-name override, 1 to 80 characters without controls                                                        |
| `CHAT_SERVERS`                                                            | unset                       | JSON array of 1 to 100 unique `{id,label,map}` destinations                                                               |
| `CHAT_PROXIMITY_ENABLED`                                                  | `false`                     | Shows proximity chat (from `chat.intercept`, filtered to `chat.proximity`) under a listen-only Proximity destination      |
| `RABBITMQ_CA_FILE`                                                        | unset                       | Optional broker CA/public certificate path                                                                                |
| `RABBITMQ_TLS_ENABLED`                                                    | inferred from URL           | Must agree with AMQPS/AMQP; TLS material requires AMQPS                                                                   |
| `RABBITMQ_TLS_CA`                                                         | unset                       | Full inline PEM CA bundle; multiline or escaped newlines, up to 256 KiB                                                   |
| `RABBITMQ_TLS_CERT`, `RABBITMQ_TLS_KEY`                                   | unset                       | Matching client certificate chain (256 KiB) and unencrypted key (64 KiB) for mutual TLS                                   |
| `RABBITMQ_TLS_CA_PATH`, `RABBITMQ_TLS_CERT_PATH`, `RABBITMQ_TLS_KEY_PATH` | unset                       | Corresponding path fallbacks; inline values take precedence, legacy CA file remains supported                             |
| `RABBITMQ_TLS_REJECT_UNAUTHORIZED`                                        | `true`                      | Verification is mandatory; false is rejected                                                                              |
| `RABBITMQ_TLS_SERVERNAME`                                                 | unset                       | Optional certificate DNS name; requires AMQPS                                                                             |
| `CHAT_BRIDGE_QUEUE`                                                       | `arrakis.dashboard.chat.v1` | Legacy queue setting; accepted but ignored in broker-generated queue mode                                                 |
| `CHAT_BRIDGE_PREFETCH`                                                    | `20`                        | Consumer prefetch, 1 to 100                                                                                               |
| `CHAT_BRIDGE_HEALTH_HOST`                                                 | `127.0.0.1`                 | Worker health-listener address                                                                                            |
| `CHAT_BRIDGE_HEALTH_PORT`                                                 | `2010`                      | Worker health-listener port, 1 to 65535                                                                                   |
| `CHAT_HISTORY_MAX_MESSAGES`                                               | `10000`                     | Exact per-destination Stream bound, 50 to 100000                                                                          |
| `CHAT_HISTORY_RETENTION_DAYS`                                             | `7`                         | Stream/deduplication retention, 1 to 90 days                                                                              |
| `CHAT_MESSAGE_MAX_CHARS`                                                  | `1000`                      | Outgoing message limit, 100 to 1800 characters                                                                            |
| `CHAT_SEND_RATE_LIMIT`                                                    | `10`                        | Per-member sends per window, 1 to 1000                                                                                    |
| `CHAT_SERVER_SEND_RATE_LIMIT`                                             | `60`                        | Per-destination sends per window, 1 to 10000                                                                              |
| `CHAT_SEND_RATE_WINDOW_SECONDS`                                           | `10`                        | Send-limit window, 1 to 300 seconds                                                                                       |

Boolean variables accept only the strings `true` and `false`.

## Tool-only variables

Season game delivery has no feature toggle: in-game season rewards (Solaris, House Credits and items) are delivered on explicit player claims for generated seasons, and by independently reviewed administrator execution for legacy seasons, whenever `DUNE_API_KEY` is set and `DUNE_API_URL` is HTTPS or loopback HTTP. It never grants automatically and never touches casino transfers. Automatic seasons start by default; an administrator pause saved in Redis is preserved across restarts. See [season operations](../features/community-seasons.md#in-game-delivery-boundary).

| Variable                                                                                                                                                                                                                                         | Used by                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OWNER_KEY_PREVIOUS_SECRET`                                                                                                                                                                                                                      | `npm run marketplace:rekey` only, after rotating `OWNER_KEY_SECRET` ([migration](../deployment/migration.md))                                                                                                     |
| `TEST_REDIS_URL`, `TEST_REDIS_CLUSTER_NODES`                                                                                                                                                                                                     | Redis integration tests only ([testing](../development/testing.md#redis-integration-tests))                                                                                                                       |
| `ALLOW_UNVERIFIED_RELEASE`, `RELEASE_TAG`                                                                                                                                                                                                        | Pterodactyl installer and the update supervisor (`RELEASE_TAG` pins a version) ([Pterodactyl](../installation/pterodactyl.md))                                                                                    |
| `AUTO_UPDATE_ENABLED`, `AUTO_UPDATE_ON_STARTUP`, `AUTO_UPDATE_CHANNEL`, `AUTO_UPDATE_INTERVAL_HOURS`, `AUTO_UPDATE_WINDOW_UTC`, `AUTO_UPDATE_HEALTH_SECONDS`, `AUTO_UPDATE_GITHUB_TOKEN`, `AUTO_UPDATE_SIGNAL_URL`, `AUTO_UPDATE_SIGNAL_SECONDS` | The update supervisor only ([automatic updates](../deployment/automatic-updates.md))                                                                                                                              |
| `NEXT_TELEMETRY_DISABLED`                                                                                                                                                                                                                        | Forced to `1` by the launcher, installer and egg                                                                                                                                                                  |
| `NODE_ENV`                                                                                                                                                                                                                                       | `development`, `test` or `production`. Set by the tooling (`npm run dev`, `npm start`, Vitest); do not set it yourself. Production enables the validation gate, `__Host-` cookies, HSTS and fail-closed behaviour |

## Production validation rules beyond presence

- `REDIS_URL` plain `redis://` with no password to a public-looking host is refused unless `REDIS_ALLOW_INSECURE=true`.
- `REDIS_REQUIRE_TLS=true` requires `rediss://`.
- `APP_URL` and `DUNE_API_URL` must not contain credentials or a fragment; `APP_URL` must have no query or path and must be
  `https` unless the host is `localhost`, `127.0.0.1` or `[::1]`.
- Warnings (not errors) are logged for plain-text Redis on a public-looking host, no Redis password, and `REDIS_CLUSTER_NODES`
  without a `rediss://` URL.

## Related

[Configuration examples](../reference/configuration-examples.md) · [Secrets management](../security/secrets-management.md) · [Security settings](../security/production-hardening.md)

## Migrating an existing `.env`

`npm run env:migrate` (also run automatically by `npm run dev` and `npm start` before `.env` is loaded; set `ARRAKIS_ENV_MIGRATE=0` to turn that off) brings a local `.env` up to date:

- `CONSOLE_URL` becomes `DUNE_API_URL`, `CONSOLE_API_KEY` and `ADMIN_CONSOLE_API_KEY` become `DUNE_API_KEY` (the administrator key wins when both exist, with a warning to check its scopes) and `ADAPTER_TOKEN` becomes `DUNE_ADAPTER_TOKEN`. A value already set under the new name is never overwritten.
- `SEASON_AUTOMATION_ENABLED`, `SEASON_GAME_DELIVERY_ENABLED`, `ADMIN_DISCORD_IDS`, `ADMIN_REAUTH_HOURS` and `ADMIN_HIGH_RISK_REAUTH_MINUTES` are removed (there is no administrator system).
- Variables that are new in `.env.example` are appended as commented placeholders, so no placeholder secret becomes live.
- Every other line, comment and custom variable is left as it is, and line endings are preserved.

A timestamped `.env.bak-…` backup is written first, the change is atomic, the command is idempotent, and only variable names are ever printed. Use `npm run env:migrate -- --dry-run` to preview. Pterodactyl deployments configure variables in the panel and have no `.env` file; rename them there by hand.
