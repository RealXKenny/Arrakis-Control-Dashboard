# API reference

The dashboard's HTTP APIs exist to serve its own web UI, and are documented so operators, integrators and contributors can reason
about them. **They are not a public, versioned developer API** except the small bearer-token [bot API](server.md#bot-world-summary).
Everything except the bot API requires a signed-in browser session cookie and, for mutations, a same-origin request.

| Page                                  | Endpoints                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| [Authentication](authentication.md)   | Auth.js routes, session check, set password                                                  |
| [Administrator](administrator.md)     | `/api/v2/admin/*`, announcements, guild oversight                                            |
| [Players](players.md)                 | `/api/player`, portal world, bases export/import/preview                                      |
| [Guilds](guilds.md)                   | Directory, requirements, applications, chat, members, support                                 |
| [Marketplace](marketplace.md)         | `/api/v2/bases/marketplace*`, legacy `/api/base-marketplace*`                                 |
| [Server and maps](server.md)          | Status, map, realtime, market, changelog, bot API, assets                                     |
| [Errors](errors.md)                   | Envelopes and codes                                                                           |
| [Rate limits](rate-limits.md)         | Limits per endpoint group                                                                     |

## Two route families

| Family      | Location               | Implementation                                                                  | Error body                                          |
| ----------- | ---------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| V2          | `src/app/api/v2/**`    | `route()` in `src/server/http.ts`                                               | `{ ok: false, error, code }`                         |
| Legacy      | `src/pages/api/**`     | thin files delegating to `runPagesApiHandler` in `src/server/pages-api.ts`      | `{ ok: false, error, code, requestId }`              |

Both families send `no-store`/private caching, `X-Content-Type-Options: nosniff`, and (legacy) `X-Request-ID`. Legacy handlers
enforce the HTTP method (405 `METHOD_NOT_ALLOWED` with `Allow`), a 2048-character URL limit (414), a concurrency cap (503) and
rate limits.

## Conventions

- **Authentication:** session cookie `dashboard_session` (`__Host-dashboard_session` in production). Anonymous callers receive 401.
- **Mutations:** `POST`, `PUT`, `PATCH`, `DELETE` need an `Origin` header equal to the `APP_URL` origin; cross-site requests are refused
  with 403 `INVALID_ORIGIN`.
- **Bodies:** JSON with strict schemas unless noted; sizes are bounded (see each endpoint).
- **IDs:** guild IDs match `^[a-zA-Z0-9_-]{1,128}$`; application IDs are 64 hex characters.
- **Examples** below use placeholder hostnames and a browser-style cookie. They are illustrative; do not script them against
  production accounts.
