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
5. As a panel administrator, fill every required variable (tables below) in *Admin → Servers → Startup*.
6. Install. The installer downloads the archive and `.sha256`, refuses a missing or mismatching pair, refuses archives with
   links, special files or absolute/parent paths, extracts without the archive's owners or modes, then runs
   `npm ci --ignore-scripts`, `npm run build` and `npm prune --omit=dev` with `NEXT_TELEMETRY_DISABLED=1`.
7. Start. Startup command: `cd /home/container && exec node scripts/server-launcher.mjs start`. The panel's "running" state is
   the console line `Arrakis Control Dashboard is listening`. Stop uses `^C`.

## Variables

Hidden variables are `user_viewable: false` and `user_editable: false`: the server owner and subusers cannot see or change
them in the Startup tab; only a panel administrator can.

| Variable                                     | Default   | Visibility        | Notes                                                                 |
| -------------------------------------------- | --------- | ----------------- | --------------------------------------------------------------------- |
| `RELEASE_TAG`                                | `latest`  | visible           | `latest` or exactly `vX.Y.Z`; anything else aborts the install        |
| `ALLOW_UNVERIFIED_RELEASE`                   | `false`   | visible           | Only `true` allows an old release with *no* checksum assets; leave `false` |
| `APP_URL`                                    | required  | visible           | Public HTTPS origin                                                    |
| `CONSOLE_URL`                                | required  | visible           | Console reachable from the container                                   |
| `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `VERIFIED_MEMBER_ROLE_ID` | required | visible | Discord application, server and role                                |
| `ADMIN_DISCORD_IDS`                          | required  | visible           | Comma-separated Discord user IDs; no default administrator exists      |
| `TRUSTED_PROXY_COUNT`                        | `1`       | visible           | Exact number of proxies (0 to 5)                                       |
| `CONSOLE_API_KEY`, `ADAPTER_TOKEN`           | required  | **hidden**        |                                                                        |
| `ADMIN_CONSOLE_API_KEY`                      | empty     | **hidden**        | Optional, separate privileged key                                      |
| `DISCORD_CLIENT_SECRET`, `AUTH_SECRET`       | required  | **hidden**        | `AUTH_SECRET` 32 to 256 characters                                     |
| `REDIS_URL`                                  | required  | **hidden**        | Includes the password; `rediss://` for TLS                              |
| `OWNER_KEY_SECRET`                           | empty     | **hidden**        | Optional dedicated marketplace owner-key secret                         |
| `BOT_API_TOKEN`, `CHANGELOG_WEBHOOK_URL`     | empty     | **hidden**        | Optional                                                               |
| `NEXT_TELEMETRY_DISABLED`                    | `1`       | hidden, fixed     | Keeps Next.js telemetry off                                            |
| `REDIS_REQUIRE_TLS`, `REDIS_ALLOW_INSECURE`, `REDIS_CLUSTER_NODES` | `false`, `false`, empty | visible | See [Redis](../configuration/redis.md)             |
| `ADMIN_REAUTH_HOURS`, `ADMIN_HIGH_RISK_REAUTH_MINUTES` | `12`, `60` | visible  | Step-up windows                                                        |
| `AUDIT_LOG_STDOUT`, `AUDIT_LOG_REDIS`, `AUDIT_LOG_MAX_ENTRIES`, `AUDIT_LOG_RETENTION_DAYS` | `true`, `true`, `10000`, `90` | visible | [Audit logs](../features/audit-logs.md) |
| `API_MAX_CONCURRENCY`, `API_GLOBAL_READ_LIMIT`, `LOG_LEVEL`, `SERVER_HOSTNAME`, `CHANGELOG_AUTO_ANNOUNCE` | `100`, `2400`, `INFO`, `0.0.0.0`, `false` | visible | |

The egg passes only the variables it defines, so a setting that is not an egg variable cannot reach the application.

## Limits of hidden variables

Hiding is **panel access control, not encryption.** Panel administrators can read the values, and anyone who can read the
server's files, its process environment or its console can still see them once the server runs. Restrict subuser permissions,
keep the node private, and rotate secrets if access was broader than intended ([secrets management](../security/secrets-management.md)).

## Verify

Console shows `Runtime configuration validated`, `Redis pool configured for dashboard data`, then the listening line. If the
configuration is invalid the server stays up but every request returns HTTP 500 and the console names the variable
([startup errors](../troubleshooting/startup-errors.md)).

## Logs

Pterodactyl's console shows stdout. Audit events appear as `AUDIT {json}` lines when `AUDIT_LOG_STDOUT=true`; ship them
off the node ([monitoring](../administration/monitoring.md)).

## Update and rollback

Change `RELEASE_TAG` and **Reinstall** from the panel to move forward or back. A pinned release must have its archive and
`.sha256` published or the install refuses it by design. Take a Redis backup first ([updating](updating.md), [rollback](../deployment/rollback.md)).

## Backups

The install directory holds no application data (Redis does). Back up Redis ([backups](../administration/backups.md)) and
keep your variable values in your secret store.

## Troubleshooting

[Pterodactyl errors](../troubleshooting/pterodactyl-errors.md)

## Not verified

The egg was exercised end to end in an isolated local simulation (real installer script, real build, real start), but not on
a live panel with Wings. Test on a throwaway server before relying on it, including Node 22, file ownership and stop behaviour.
