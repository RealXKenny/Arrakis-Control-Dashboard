# Dune Console

## Overview

The dashboard reads and (for admins) controls your game server **through the Dune Console HTTP API**. In practice that is the
Console of [RedBlink Dune Docker](../integrations/redblink-dune-docker.md) (web UI and API on port `8088` by default). The
dashboard has no direct access to the game database or containers.

## Credentials

Two credentials; never reuse a value between them or with `AUTH_SECRET`:

| Variable             | Sent as                                                          | Used for                                                                             |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `DUNE_API_KEY`       | `Authorization: Bearer <key>` to `DUNE_API_URL`                  | Member reads, administrator operations and season delivery                           |
| `DUNE_ADAPTER_TOKEN` | `Authorization: Bearer <token>` to `/api/integrations/discord/*` | The Console's Discord adapter (linked-character lookup, adapter tools, Discord side) |

The dashboard never uses Console passwords or browser sessions, never performs CSRF or re-login with the Console, and never
returns these values to browsers. Dashboard authorization stays independent of the key's power: members still need verified
sessions, canonical player/asset/guild checks and fresh leader verification, and administrators still need the exact
verified identity, recent sign-in and request budgets. Console operations are refused without `DUNE_API_KEY`, adapter
operations without `DUNE_ADAPTER_TOKEN`, and administrator and delivery requests are additionally refused unless
`DUNE_API_URL` is HTTPS or loopback HTTP.

### Adapter token

The upstream adapter does not accept Console API keys: it compares the bearer against its own token, configured on the
Console side (`DUNE_BOT_API_TOKEN_FILE` or `DUNE_DISCORD_ADAPTER_TOKEN`, verified in upstream `requireDiscordBotToken`). Use the
identical value for `DUNE_ADAPTER_TOKEN`; the adapter stays disabled until `DUNE_DISCORD_ADAPTER_ENABLED=true`. Mismatched values
make adapter calls fail with `401` while ordinary Console calls keep working.
See [RedBlink integration](../integrations/redblink-dune-docker.md#enable-the-discord-adapter).

## Suggested key scopes

Console API keys start with no access and are scoped per namespace (None / Read / Read+write, or an explicit action list).
These are the Console routes the member features call, so these namespaces need **Read**:

| Dashboard feature          | Console routes called (GET unless noted)                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Portal, status, population | `/api/players`, `/api/players/online`, `/api/map/markers`, `/api/exchange/stats`, `/api/admin/landsraad`                    |
| Character, holdings        | `/api/players/{id}/…`, `/api/players/{id}/bases`, `/api/bases/{id}/export`                                                  |
| Vehicles                   | `/api/players/{id}/vehicles`, `/api/vehicles`                                                                               |
| Market                     | `/api/exchange/items`, `/api/exchange/listings`, `/api/exchange/market`, `/api/exchange/stats`                              |
| Maps                       | `/api/map/markers`, `/api/realtime/objects`, `/api/players/online`                                                          |
| Guilds                     | `/api/guilds`, `/api/guilds/{id}/members`; **POST/DELETE/…** `/api/guilds/{id}/…` for leader tools and accepting applicants |

Grant guild write actions only if you want leaders to manage members from the dashboard. Authoritative namespace and action
names are shown in the Console's key editor (_Settings → API Keys_). Some namespaces (`settings`, `database`, `setup`,
`community`) can never be granted to a key; the dashboard's administrator catalog marks those operations as restricted.
Verify scopes with the [connection checks](#verify) rather than assuming.

## Network and transport

- `DUNE_API_URL` must be reachable **from the dashboard process**. Use `https` for any remote Console; the administrator
  workspace requires HTTPS for remote Console administration and permits `http` only on loopback.
- Reads retry up to 3 times on 408, 425, 500, 502, 503, 504; writes never retry. The default timeout is 30 s.
- Do not expose the Console port to untrusted users; only the dashboard host needs it.
- Upstream also offers an optional encrypted API front door (`dune-tls-front`) — see the RedBlink docs if you need TLS between hosts.

## Verify

Linux (bash), from the dashboard host:

```bash
curl -sS -H "Authorization: Bearer $DUNE_API_KEY" "$DUNE_API_URL/api/players?page=1&pageSize=1"
curl -sS -H "Authorization: Bearer $DUNE_API_KEY" "$DUNE_API_URL/api/integrations/discord/health"
```

Windows (PowerShell):

```powershell
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:DUNE_API_KEY" } "$env:DUNE_API_URL/api/players?page=1&pageSize=1"
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:DUNE_API_KEY" } "$env:DUNE_API_URL/api/integrations/discord/health"
```

A `401` means the key/token is wrong, disabled or expired (a bad bearer is **not** retried with a cookie); `403` usually means a
missing scope; the adapter answers `404` when disabled and `503` when its token file is missing. In the dashboard, `/admin`
→ _Overview_ shows whether the admin key and adapter are configured and whether they work.

## Security

Treat both values as secrets ([secrets management](../security/secrets-management.md)). Prefer the narrowest scopes that cover the features you use. Because one key now serves members and administrators, protect
it like an administrator credential and rotate it when an administrator leaves.

## Troubleshooting

[Console connection](../troubleshooting/console-connection.md)
