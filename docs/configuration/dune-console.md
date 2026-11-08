# Dune Console

## Overview

The dashboard reads and (for admins) controls your game server **through the Dune Console HTTP API**. In practice that is the
Console of [RedBlink Dune Docker](../integrations/redblink-dune-docker.md) (web UI and API on port `8088` by default). The
dashboard has no direct access to the game database or containers.

## Credentials

Three distinct credentials; never reuse a value among them or with `AUTH_SECRET`:

| Variable                | Sent as                                        | Used for                                                                 |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `CONSOLE_API_KEY`       | `Authorization: Bearer <key>` to `CONSOLE_URL` | Member features: characters, guilds, exchange, vehicles, maps, realtime  |
| `ADMIN_CONSOLE_API_KEY` | `Authorization: Bearer <key>`                  | The administrator workspace only (separate, scoped; optional)             |
| `ADAPTER_TOKEN`         | `Authorization: Bearer <token>` to `/api/integrations/discord/*` | The Console's Discord adapter (linked-character lookup, adapter tools) |

The dashboard never uses Console passwords or browser sessions, never performs CSRF or re-login with the Console, and never
returns these values to browsers. The administrator workspace refuses to run Console operations without
`ADMIN_CONSOLE_API_KEY`, and adapter operations without `ADAPTER_TOKEN`.

### Adapter token

The token is whatever you configured on the Console's side (`DUNE_BOT_API_TOKEN_FILE` or `DUNE_DISCORD_ADAPTER_TOKEN`); the
adapter is disabled until `DUNE_DISCORD_ADAPTER_ENABLED=true`. Use the identical value for `ADAPTER_TOKEN`.
See [RedBlink integration](../integrations/redblink-dune-docker.md#enable-the-discord-adapter).

## Suggested key scopes

Console API keys start with no access and are scoped per namespace (None / Read / Read+write, or an explicit action list).
These are the Console routes the member features call, so these namespaces need **Read**:

| Dashboard feature          | Console routes called (GET unless noted)                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Portal, status, population | `/api/players`, `/api/players/online`, `/api/map/markers`, `/api/exchange/stats`, `/api/admin/landsraad` |
| Character, holdings        | `/api/players/{id}/…`, `/api/players/{id}/bases`, `/api/bases/{id}/export`                       |
| Vehicles                   | `/api/players/{id}/vehicles`, `/api/vehicles`                                                    |
| Market                     | `/api/exchange/items`, `/api/exchange/listings`, `/api/exchange/market`, `/api/exchange/stats`  |
| Maps                       | `/api/map/markers`, `/api/realtime/objects`, `/api/players/online`                               |
| Guilds                     | `/api/guilds`, `/api/guilds/{id}/members`; **POST/DELETE/…** `/api/guilds/{id}/…` for leader tools and accepting applicants |

Grant guild write actions only if you want leaders to manage members from the dashboard. Authoritative namespace and action
names are shown in the Console's key editor (*Settings → API Keys*). Some namespaces (`settings`, `database`, `setup`,
`community`) can never be granted to a key; the dashboard's administrator catalog marks those operations as restricted.
Verify scopes with the [connection checks](#verify) rather than assuming.

## Network and transport

- `CONSOLE_URL` must be reachable **from the dashboard process**. Use `https` for any remote Console; the administrator
  workspace requires HTTPS for remote Console administration and permits `http` only on loopback.
- Reads retry up to 3 times on 408, 425, 500, 502, 503, 504; writes never retry. The default timeout is 30 s.
- Do not expose the Console port to untrusted users; only the dashboard host needs it.
- Upstream also offers an optional encrypted API front door (`dune-tls-front`) — see the RedBlink docs if you need TLS between hosts.

## Verify

Linux (bash), from the dashboard host:

```bash
curl -sS -H "Authorization: Bearer $CONSOLE_API_KEY" "$CONSOLE_URL/api/players?page=1&pageSize=1"
curl -sS -H "Authorization: Bearer $ADAPTER_TOKEN"   "$CONSOLE_URL/api/integrations/discord/health"
```

Windows (PowerShell):

```powershell
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:CONSOLE_API_KEY" } "$env:CONSOLE_URL/api/players?page=1&pageSize=1"
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:ADAPTER_TOKEN" } "$env:CONSOLE_URL/api/integrations/discord/health"
```

A `401` means the key/token is wrong, disabled or expired (a bad bearer is **not** retried with a cookie); `403` usually means a
missing scope; the adapter answers `404` when disabled and `503` when its token file is missing. In the dashboard, `/admin`
→ *Overview* shows whether the admin key and adapter are configured and whether they work.

## Security

Treat all three as secrets ([secrets management](../security/secrets-management.md)). Prefer the narrowest scopes; use a
separate admin key so a leaked member key cannot administer the server.

## Troubleshooting

[Console connection](../troubleshooting/console-connection.md)
