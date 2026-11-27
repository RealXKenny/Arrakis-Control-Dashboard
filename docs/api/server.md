# API: server status, maps, market and bot

## Server status

`GET /api/server/status` — public (no session). Returns real counts and nothing else sensitive. Legacy-family rate limits apply (120/min per client).
Source: `src/features/server-status/server/status.ts`.

## Maps

| Method | Route                           | Auth    | Notes                                                                                                                                                                                                                |
| ------ | ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v2/map?map=`              | session | `HaggaBasin` (default), `DeepDesert`, `Arrakeen`, or `HarkoVillage`; other values 400. The first two return map markers; the latter three return only the verified linked character's position and observation time. |
| GET    | `/api/v2/map/realtime?map=`     | session | Realtime layer; `Cache-Control: private, no-store`                                                                                                                                                                   |
| GET    | `/api/v2/map/player-live?map=`  | session | Inferred position for the freshly verified linked character only, or `null` when unavailable or ambiguous; 60 requests per account per minute, no-store.                                                             |
| GET    | `/api/map`, `/api/map/realtime` | session | Legacy equivalents                                                                                                                                                                                                   |
| GET    | `/api/portal/world?map=`        | session | Briefing for the portal                                                                                                                                                                                              |

## Market

`GET /api/market` (items), `/api/market/listings`, `/api/market/config` — session required; the Console exchange routes are called with the
member key. Prices keep full precision; seller IDs never reach the browser.

## Changelog

`GET /api/changelog` — public release notes parsed from `CHANGELOG.md`.

## Release updates

`POST /api/v2/updates/github` — the GitHub **Releases** webhook. Off (404) until `UPDATE_WEBHOOK_SECRET` is set; a
delivery without a valid `X-Hub-Signature-256` gets 401, a body over 2 MB gets 413. Only published, non-draft releases
of the bot and dashboard repositories with a `vX.Y.Z` tag are recorded; anything else answers 202 and is ignored.

`GET /api/v2/updates/signal` — public and read-only:
`{ "schemaVersion": 1, "releases": { "RealXKenny/Arrakis-Control-Bot": { "version", "prerelease", "publishedAt" } } }`.
The update supervisors read it as a hint to check GitHub right away; see
[instant updates](../deployment/automatic-updates.md#instant-updates).

## Assets

`GET`/`HEAD /api/assets/[...path]` — read-only, allowlisted paths under `src/assets` (terrain bundles at `/api/assets/terrain/*`); `/items/*`,
`/maps/*` and `/favicon.ico` rewrite to it.

## Bot world summary

`GET /api/v1/bot/world[?map=<name>]` — for **your own bot**; a versioned, read-only, sanitized world summary.

|             |                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Auth        | `Authorization: Bearer <BOT_API_TOKEN>` (token length 32 to 256; header ≤ 263 characters)               |
| Disabled    | 503 `BOT_API_DISABLED` when `BOT_API_TOKEN` is unset                                                    |
| Wrong token | 401 with `WWW-Authenticate: Bearer realm="arrakis-bot"`                                                 |
| Limit       | 60 per minute shared; 429 `RATE_LIMITED` + `Retry-After`; 503 `RATE_LIMIT_UNAVAILABLE` if Redis is down |
| Query       | At most one `map` parameter (else 400)                                                                  |

```bash
curl -sS -H "Authorization: Bearer $BOT_API_TOKEN" "https://dashboard.example.com/api/v1/bot/world?map=HaggaBasin"
```

The token is distinct from the Discord bot token, the Console credentials and the adapter token. There is no browser impersonation.
Rotate by replacing it on both services and restarting the dashboard.
