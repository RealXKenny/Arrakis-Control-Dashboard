# Pterodactyl

## Overview

Each GitHub Release attaches `egg-arrakis-control-dashboard.json`, generated from the exact release commit by
`scripts/deployment/build-pterodactyl-egg.mjs`. The egg installs the **checksum-verified release archive**, builds it, and
starts it with the standard Node.js 22 image. It does not install the game server; for that see
[RedBlink integration](../integrations/redblink-dune-docker.md).

## Requirements

- Pterodactyl panel and Wings (PTDL_v2 egg format).
- Docker image `ghcr.io/pterodactyl/yolks:nodejs_22` (set by the egg). The installer container is `node:22-bookworm`.
- Outbound HTTPS from the installer to `api.github.com` and the release assets host.
- A reachable Redis, a Discord application and a Dune Console ([requirements](../getting-started/requirements.md)).
- A Pterodactyl **administrator** to enter the hidden credentials (see below).

## Install

1. Download `egg-arrakis-control-dashboard.json` from the [latest release](https://github.com/RealXKenny/Arrakis-Control-Dashboard/releases/latest) and import it into a nest.
2. Create a server from the egg with the Node.js 22 image and **one** allocation. Wings supplies `SERVER_PORT`; the egg
   does not define it, and sets `SERVER_HOSTNAME` to `0.0.0.0` so Wings can reach the app.
3. Set `RELEASE_TAG` to an exact version such as `v2.1.0` (recommended) or leave `latest`.
4. Leave `ALLOW_UNVERIFIED_RELEASE` at `false`.
5. As a panel administrator, fill every required variable (tables below) in _Admin → Servers → Startup_.
6. Install. The installer downloads the archive and `.sha256`, refuses a missing or mismatching pair, refuses archives with
   links, special files or absolute/parent paths, extracts without the archive's owners or modes, then runs
   `npm ci --ignore-scripts`, `npm run build` and `npm prune --omit=dev` with `NEXT_TELEMETRY_DISABLED=1`.
7. Start. Startup command: `cd /home/container && exec node scripts/deployment/updater/supervisor.mjs`. The supervisor
   checks for a verified update (see [automatic updates](../deployment/automatic-updates.md)), then starts
   `node scripts/server-launcher.mjs start` as its only child. The panel's "running" state is the console line
   `Arrakis Control Dashboard is listening`. Stop uses `^C`, which the supervisor forwards to the dashboard.

Reinstalling over an existing installation never overwrites or re-permissions `.env`, certificates or custom folders.
When the updater is already installed, the installer changes nothing. On a 2.0.0 installation it adds only the updater
files and `.arrakis/bootstrap.json`; see [migrating an existing server](../deployment/automatic-updates.md#migrating-an-existing-server).
New releases arrive through the automatic updater.

## Variables

Hidden variables are `user_viewable: false` and `user_editable: false`: the server owner and subusers cannot see or change
them in the Startup tab; only a panel administrator can.

| Variable                                                                                                                                                                                 | Default                                     | Visibility    | Notes                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `RELEASE_TAG`                                                                                                                                                                            | `latest`                                    | visible       | `latest` or exactly `vX.Y.Z`; anything else aborts the install                                          |
| `ALLOW_UNVERIFIED_RELEASE`                                                                                                                                                               | `false`                                     | visible       | Only `true` allows an old release with _no_ checksum assets; leave `false`                              |
| `APP_URL`                                                                                                                                                                                | required                                    | visible       | Public HTTPS origin                                                                                     |
| `DUNE_API_URL`                                                                                                                                                                           | required                                    | visible       | Console reachable from the container                                                                    |
| `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `VERIFIED_MEMBER_ROLE_ID`                                                                                                                       | required                                    | visible       | Discord application, server and role                                                                    |
| `MODERATOR_DISCORD_ROLE_IDS`, `EVENT_REVIEWER_DISCORD_ROLE_IDS`, `BACKUP_VIEWER_DISCORD_ROLE_IDS`                                                                                        | empty                                       | visible       | Separate optional role lists for moderation, event review and backup status                             |
| `TRUSTED_PROXY_COUNT`                                                                                                                                                                    | `1`                                         | visible       | Exact number of proxies (0 to 5)                                                                        |
| `DUNE_API_KEY`, `DUNE_ADAPTER_TOKEN`                                                                                                                                                     | required                                    | **hidden**    | Console API key and Discord adapter token                                                               |
| `DISCORD_CLIENT_SECRET`, `AUTH_SECRET`                                                                                                                                                   | required                                    | **hidden**    | `AUTH_SECRET` 32 to 256 characters                                                                      |
| `REDIS_URL`                                                                                                                                                                              | required                                    | **hidden**    | Includes the password; `rediss://` for TLS                                                              |
| `OWNER_KEY_SECRET`                                                                                                                                                                       | empty                                       | **hidden**    | Optional dedicated marketplace owner-key secret                                                         |
| `BOT_API_TOKEN`, `DISCORD_BOT_TOKEN`                                                                                                                                                     | empty                                       | **hidden**    | Optional                                                                                                |
| `NEXT_TELEMETRY_DISABLED`                                                                                                                                                                | `1`                                         | hidden, fixed | Keeps Next.js telemetry off                                                                             |
| `REDIS_REQUIRE_TLS`, `REDIS_ALLOW_INSECURE`, `REDIS_CLUSTER_NODES`                                                                                                                       | `false`, `false`, empty                     | visible       | See [Redis](../configuration/redis.md)                                                                  |
| `AUDIT_LOG_STDOUT`, `AUDIT_LOG_REDIS`, `AUDIT_LOG_MAX_ENTRIES`, `AUDIT_LOG_RETENTION_DAYS`                                                                                               | `true`, `true`, `10000`, `90`               | visible       | [Audit logs](../features/audit-logs.md)                                                                 |
| `API_MAX_CONCURRENCY`, `API_GLOBAL_READ_LIMIT`, `LOG_LEVEL`, `LOG_COLOR`, `SERVER_HOSTNAME`                                                                                              | `100`, `2400`, `INFO`, `auto`, `0.0.0.0`    | visible       |                                                                                                         |
| `COMMUNITY_EVENTS_CHANNEL_ID`                                                                                                                                                            | empty                                       | visible       | Optional channel for event announcements                                                                |
| `DUNE_API_TIMEOUT_MS`                                                                                                                                                                    | empty (20000)                               | visible       | Console read timeout ([caching](../architecture/caching.md))                                            |
| `DUNGEON_LEADERBOARD_REFRESH_SECONDS`                                                                                                                                                    | `300`                                       | visible       | [Dungeon leaderboard](../features/dungeon-leaderboard.md)                                               |
| `SOLARIS_WEEKLY_PRIZES`                                                                                                                                                                  | (empty)                                     | visible       | [Solaris leaderboard](../features/solaris-leaderboard.md)                                               |
| `ROADMAP_REPOSITORIES`, `ROADMAP_LABEL`, `ROADMAP_REFRESH_SECONDS`                                                                                                                       | both repositories, `roadmap`, `1200`        | visible       | [Roadmap](../features/roadmap.md)                                                                       |
| `ROADMAP_GITHUB_TOKEN`                                                                                                                                                                   | empty                                       | **hidden**    | Optional read-only GitHub token                                                                         |
| `CASINO_SOLARIS_ENABLED`, `CASINO_MAX_WAGER`, `CASINO_MAX_PAYOUT`                                                                                                                        | `false`, `10000`, `1000000`                 | visible       | [Solaris Exchange](../features/solaris-exchange.md); read before enabling                               |
| `POKER_ACTIVITY_ENABLED`                                                                                                                                                                 | `false`                                     | visible       | [Poker Activity](../features/poker-activity.md)                                                         |
| `CHAT_ENABLED`, `CHAT_BRIDGE_FUNCOM_ID`, `CHAT_DISCORD_BOT_FUNCOM_ID`, `CHAT_BRIDGE_DISPLAY_NAME`, `CHAT_SERVERS`, `CHAT_PROXIMITY_ENABLED`                                              | `false`, empty                              | visible       | Live game chat                                                                                          |
| `RABBITMQ_URL`, `RABBITMQ_TLS_KEY`                                                                                                                                                       | empty                                       | **hidden**    | Broker URL with credentials and inline client key                                                       |
| `RABBITMQ_TLS_ENABLED`, `RABBITMQ_TLS_SERVERNAME`, `RABBITMQ_TLS_CA`, `RABBITMQ_TLS_CERT`, `RABBITMQ_TLS_CA_PATH`, `RABBITMQ_TLS_CERT_PATH`, `RABBITMQ_TLS_KEY_PATH`, `RABBITMQ_CA_FILE` | empty                                       | visible       | Certificate files stay where you put them; updates never touch them                                     |
| `RABBITMQ_TLS_REJECT_UNAUTHORIZED`                                                                                                                                                       | `true`                                      | fixed         | Verification cannot be disabled                                                                         |
| `CHAT_BRIDGE_QUEUE`, `CHAT_BRIDGE_PREFETCH`, `CHAT_BRIDGE_HEALTH_HOST`, `CHAT_BRIDGE_HEALTH_PORT`                                                                                        | legacy queue, `20`, `127.0.0.1`, `2010`     | visible       | Chat bridge tuning                                                                                      |
| `CHAT_HISTORY_MAX_MESSAGES`, `CHAT_HISTORY_RETENTION_DAYS`, `CHAT_MESSAGE_MAX_CHARS`, `CHAT_SEND_RATE_LIMIT`, `CHAT_SERVER_SEND_RATE_LIMIT`, `CHAT_SEND_RATE_WINDOW_SECONDS`             | `10000`, `7`, `1000`, `10`, `60`, `10`      | visible       | Chat limits                                                                                             |
| `AUTO_UPDATE_ENABLED`, `AUTO_UPDATE_ON_STARTUP`, `AUTO_UPDATE_CHANNEL`, `AUTO_UPDATE_INTERVAL_HOURS`, `AUTO_UPDATE_WINDOW_UTC`, `AUTO_UPDATE_HEALTH_SECONDS`                             | `true`, `true`, `stable`, `6`, empty, `120` | visible       | [Automatic updates](../deployment/automatic-updates.md)                                                 |
| `AUTO_UPDATE_GITHUB_TOKEN`                                                                                                                                                               | empty                                       | **hidden**    | Optional read-only token for release downloads                                                          |
| `UPDATE_WEBHOOK_SECRET`                                                                                                                                                                  | empty                                       | **hidden**    | GitHub release webhook secret for [instant updates](../deployment/automatic-updates.md#instant-updates) |
| `AUTO_UPDATE_SIGNAL_SECONDS`                                                                                                                                                             | `30`                                        | visible       | Seconds between release-signal checks (10-3600)                                                         |

The egg passes only the variables it defines, so a setting that is not an egg variable cannot reach the application.

## Limits of hidden variables

Hiding is **panel access control, not encryption.** Panel administrators can read the values, and anyone who can read the
server's files, its process environment or its console can still see them once the server runs. Restrict subuser permissions,
keep the node private, and rotate secrets if access was broader than intended ([secrets management](../security/secrets-management.md)).

Optional community event announcements use `DISCORD_BOT_TOKEN` and `COMMUNITY_EVENTS_CHANNEL_ID`. Reuse the main bot token; the channel must belong to `DISCORD_GUILD_ID`. Changelogs are posted by the Arrakis Control bot, not the dashboard. The egg hides the bot token from panel users. See [Discord announcements](../integrations/webhooks.md).

## Verify

Console shows `Runtime configuration validated`, `Redis pool configured for dashboard data`, then the listening line. If the
configuration is invalid the server stays up but every request returns HTTP 500 and the console names the variable
([startup errors](../troubleshooting/startup-errors.md)).

## Logs

Pterodactyl's console shows stdout. Audit events appear as readable, colored AUDIT entries when `AUDIT_LOG_STDOUT=true`; ship them
off the node ([monitoring](../administration/monitoring.md)).

## Update and rollback

Updates are automatic by default: the supervisor checks at startup and every `AUTO_UPDATE_INTERVAL_HOURS`, verifies and
builds the release in a staging folder, and only then stops the dashboard briefly to install it. A version that does not
start cleanly is rolled back automatically and skipped from then on. Set `RELEASE_TAG` to stay on one version, or
`AUTO_UPDATE_ENABLED=false` to update by hand. Downgrades are never automatic; see
[automatic updates](../deployment/automatic-updates.md) for the full behaviour, conflicts and manual rollback, and take a
Redis backup before major versions ([updating](updating.md), [rollback](../deployment/rollback.md)).

Existing servers created from an older egg keep the old startup command until you re-import the egg; follow
[migrating an existing server](../deployment/automatic-updates.md#migrating-an-existing-server).

## Backups

The install directory holds no application data (Redis does). Back up Redis ([backups](../administration/backups.md)) and
keep your variable values in your secret store.

## Troubleshooting

[Pterodactyl errors](../troubleshooting/pterodactyl-errors.md)

## Not verified

The egg was exercised end to end in an isolated local simulation (real installer script, real build, real start), but not on
a live panel with Wings. Test on a throwaway server before relying on it, including Node 22, file ownership and stop behaviour.
