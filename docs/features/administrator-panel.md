# Administrator panel

## Purpose

`/admin` is a scoped workspace over the Console API for authorized administrators: server operations, players, guilds, bases,
vehicles, maps, market, backups, logs, updates, addons, care packages and more, with dedicated manager screens for the common
tasks and a generic catalog form behind `advanced=1`.

## Requirements and permissions

- Your Discord ID in `ADMIN_DISCORD_IDS`, in the right guild, with the member role ([administrator access](../configuration/administrator-access.md)).
- A separate `ADMIN_CONSOLE_API_KEY` (Console operations) and/or `ADAPTER_TOKEN` (adapter operations). Without them the panel is
  disabled for those operations (`ADMIN_CONFIG_REQUIRED`, 503).
- HTTPS to the Console, or loopback HTTP (`ADMIN_SECURE_TRANSPORT_REQUIRED`).
- Recent interactive sign-in for changes ([step-up](#step-up-re-authentication)).

## The catalog

`src/features/admin/catalog.json` is an **allowlist** of 383 method/route operations. The dashboard can never be asked to call an
arbitrary URL or send arbitrary headers. Each entry has an id, method, route, group, title, provider (`console` or `adapter`), mode
(`json`, `events`, `download`, `upload`, `multipart`), path parameters, confirmation phrases and an optional restriction.

| Group                          | Operations |  | Group                       | Operations |
| ------------------------------ | ---------: |--| --------------------------- | ---------: |
| Players                        | 62         |  | Maps & World                | 45         |
| Bases & Storage                | 41         |  | Server Operations           | 29         |
| Discord Adapter (Experimental) | 30         |  | Market Board                | 25         |
| Admin Tools                    | 24         |  | Backups                     | 17         |
| Vehicles                       | 13         |  | Care Package System         | 13         |
| Authentication & Setup         | 12         |  | Database                    | 12         |
| Updates                        | 10         |  | Live Map                    | 10         |
| Addons                         | 9          |  | Guilds                      | 7          |
| Settings & Public Directory    | 7          |  | Blueprints                  | 5          |
| API Keys                       | 5          |  | Logs & Monitoring           | 4          |
| IAM Policies                   | 3          |  |                             |            |

Operations marked **restricted** (setup, database, settings, IAM, API keys, addon writes, Console login…) are permanently refused
for API keys by the Console, and the dashboard refuses them with `CONSOLE_OPERATION_RESTRICTED` (403). Which operations actually
work depends on your Console version and the admin key's scopes; the catalog is not a promise that every Console supports every entry.

## Using it

Open `/admin`. Sections: Control center, Players & community, Game assets, World & economy, Operations, Configuration & advanced,
with tabs and shareable `/admin?tab=<id>&operation=<id>` URLs. For a write, type the exact confirmation shown (`METHOD /route`) and
any native Console confirmation phrase. Results are sanitized (secrets and unknown shapes stripped).

### Transfer bounds

Request body 128 KiB (parsed JSON 64 KiB); uploads 8 MiB with a 30 s receive deadline; downloads stream at most 128 MiB over 120 s;
log/task event streams at most 60 s and 2 MiB.

## Step-up re-authentication

| Class     | Rule (from `src/features/admin/server/risk.ts`)                                                                                  | Window                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| High risk | downloads, uploads, multipart, `DELETE`, confirmation-phrase operations, **and every other non-GET operation** not on the low-risk list | `ADMIN_HIGH_RISK_REAUTH_MINUTES` (60) |
| Low risk  | Reviewed list: `post-updates-check-game`, `post-updates-check-stack`, `post-players-list-settings`, `post-exchange-market-buyback-probe`, `post-integrations-discord-players-link-verify`, `post-auth-login`, `post-auth-logout`, `post-setup-preflight` | `ADMIN_REAUTH_HOURS` (12)            |
| Read      | `GET`                                                                                                                               | valid session only                  |

Examples that are **high risk**: backup delete/restore/import, server stop/restart, game updates, history clear, kick-all,
blueprint imports, destructive bulk operations. Unknown new operations default to high risk.

## Guild oversight

Administrators can read any guild's applications and chats and reply in guild support threads
(`/api/admin/guilds/{guildId}/…`, `/api/admin/guild-support-status`). Reading is logged by the `ADMIN` logger; replies need the
general step-up window.

## Other administrator endpoints

`GET /api/v2/admin/overview`, `/catalog`, `/audit`; `POST /api/v2/admin/execute`, `/upload`; `DELETE /api/v2/admin/sessions`;
`POST /api/v2/changelog/announce` ([API: administrator](../api/administrator.md)).

## Audit

Every write and download is recorded as `admin.operation` with the operation id and result status; denied access, refused
re-authentication and session revocation have their own events ([audit logs](audit-logs.md)).

## Limitations

The panel is a thin, safe client of the Console; it implements no operation itself. MFA is not available. A leaked administrator
cookie can read until it expires or is revoked ([sessions](sessions.md)).

## Troubleshooting

`ADMIN_REAUTH_REQUIRED` → sign in again. `CONFIRMATION_REQUIRED` → type the exact `METHOD /route`. `CONSOLE_OPERATION_FAILED` →
the Console refused; the key lacks scope or the operation is unsupported. See [Console connection](../troubleshooting/console-connection.md).

## Related

[Administration guide](../administration/README.md) · [API](../api/administrator.md) · [RedBlink Console](../integrations/redblink-dune-docker.md)
