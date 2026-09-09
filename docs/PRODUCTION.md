# Production Operations

## Configuration

Copy `.env.example` to `.env` and provide Dune, Discord, and shared-storage values. Select `STORAGE_BACKEND=redis` with `REDIS_URL`, or `STORAGE_BACKEND=postgres` with `DATABASE_URL`. Secrets must never use a `NEXT_PUBLIC_` prefix. Sentry is optional.

`CONSOLE_API_KEY` is sent as a bearer credential and must have full access to every enabled player, guild, base, vehicle, map, and exchange feature. It is the only Console credential used by the dashboard. `ADAPTER_TOKEN` remains separate for Discord-linked player identity.

### Multiple sietches and Deep Deserts

The dashboard combines `/api/sietches`, `/api/sietches/dimensions`, `/api/deepdesert`, and `/api/map/partitions` into its authenticated destination catalog. Sietch display names are used in navigation and map selectors. Each marker/world request carries the selected map and `partitionId`, so identically typed destinations do not share readings or cached map state. Offline destinations remain listed and are marked as offline. Set `SITE_DEFAULT_DESTINATION` to a discovered key when one instance should open by default; `SITE_DEFAULT_MAP` remains the fallback for older Console responses.

### PostgreSQL

Create an empty database, configure it, and apply the idempotent schema before the first start:

```dotenv
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://arrakis:password@postgres-host:5432/arrakis
DATABASE_SSL_MODE=require
```

```text
npm run db:migrate
```

SSL mode accepts `disable`, `require`, or `verify-full`. The migration creates tables for sessions, rate limits, base-import reservations, leases, population samples, and guild logos. Use normal PostgreSQL backups; the dashboard does not create database backups.

## Request handling

### Self-hosted Redis on Pterodactyl

Set the dashboard's server-only environment variable to the Redis server's reachable allocation address and assigned port:

```dotenv
REDIS_URL=redis://default:YOUR_PASSWORD@REDIS_ALLOCATION_HOST:ALLOCATED_PORT/0
```

Use `redis://` for this deployment without TLS. Replace the port with the actual Redis allocation; it need not be 6379. `localhost` inside the dashboard container points to that container, so use the Redis allocation host for a separate Redis server. Percent-encode special characters in the password. Configure Redis authentication and restrict network access to the dashboard host/private network. The connection format and TLS support follow [the Redis Node.js connection documentation](https://redis.io/docs/latest/develop/clients/nodejs/connect/).

Enable Redis persistence (AOF or snapshots) in the persistent server directory configured by your Pterodactyl egg so sessions and logos survive Redis restarts. Keep backups of that directory. All dashboard replicas must use the same Redis URL and database number.

This cutover starts with an empty database: no Upstash data is copied or deleted. Existing logins will require signing in again; logos, population history, and import tracking begin empty. Remove `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from deployment settings, set `REDIS_URL`, install dependencies, build, and restart the dashboard. Verify Discord login, session survival after a dashboard restart, and logout. Old Upstash settings are no longer read by the application.

Pages API routes are wrapped by `runPagesApiHandler`. It assigns an `X-Request-ID`, applies method checks and rate limits, writes compact route-aware logs with secret redaction, and returns safe error envelopes. Unexpected errors are reported to Sentry when configured.

Rate limits use atomic fixed-window counters in the selected backend and fail closed with HTTP 503 when shared storage is unavailable in production. Development and tests use a bounded local fallback only when storage is not configured.

OAuth session lifetime is controlled by `SESSION_TTL_SECONDS` (12 hours by default). Records use the session's remaining lifetime. Cookies contain only a random session identifier; OAuth access tokens are never persisted. Logout deletes the shared record and expires the cookie. Without configured storage in development, the process-wide fallback survives module reloads but ends when the server process stops.

## Monitoring

Production startup clears the terminal viewport and scrollback, silences dotenv's tip, and filters Next.js startup information. Application logs and stderr remain visible. Set `DASHBOARD_CLEAN_CONSOLE=false` to retain the full startup output and disable clearing.

For Pterodactyl, use `npm run --silent build && npm run --silent start` to avoid npm's script headings. Build output remains visible during the build; the start command sends ANSI clear sequences before launching the application. Whether previous output disappears depends on the panel's terminal handling; stored server logs are not erased. Deploy the updated `scripts/run-next.mjs` and restart the server to apply this change.

Set `SENTRY_DSN` for server and Edge reporting and `NEXT_PUBLIC_SENTRY_DSN` for browser reporting. Browser configuration does not fall back to server environment values. Startup is consolidated in `src/instrumentation.ts`, which initializes monitoring and warms the Dune client on Node.js. Response snapshots are disabled by default and no market response snapshots are written to disk. Set `API_DEBUG_ENABLED=true` only for temporary diagnostics in gitignored `debug/api/`; disable it for normal deployment.

Browser monitoring sends directly to the configured Sentry ingestion origin, which middleware includes in `connect-src`. The `/monitoring` external rewrite is intentionally removed: its Next.js proxy listeners combined with Sentry reproduce `MaxListenersExceededWarning` on Next 16.3. Do not raise the global listener limit to mask this warning.

API responses explicitly prevent browser/CDN caching, including authentication failures. For repeated logins, correlate `Login established`, `Login cookie missing`, and `Login record unavailable` logs. The latter reports `expired` versus `not_found` and the storage backend, without recording cookie values, session identifiers, or user profiles. A 401 alone does not establish that the 12-hour lifetime expired.

Server logs are structured JSON in production and readable context logs in development. Sensitive keys are redacted before logging or sending error context to Sentry. Source maps are uploaded by the Sentry Next.js plugin only when the deployment provides `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.

## Verification

```text
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
```

Vitest covers the shared hardening utilities and API boundary behavior. External provider integration and browser workflows still require environment-backed integration or end-to-end tests before a high-risk production launch.

## Portal release checks

Logout requires POST; GET and Next data prefetch requests must never revoke a session. Blueprint export requires server-verified ownership. Before deploying the rebuilt portal, follow [Portal rebuild acceptance](PORTAL_REBUILD.md), including the browser tests and live-provider acceptance checks. Automated browser tests use fixture responses; they do not replace staging validation.

## Current release preparation

The footer displays the package version automatically (currently v1.0.4). My bases keeps the import form after the holdings cards, with its Upload JSON input always visible and separated by 28px of vertical margin. Empty community/live/Solido directory stubs were removed; the catalogued item and marker assets remain supported.

### Thirty-second cache contract

Successful GET readings for player, map, market, price ladder, world and public server status are cached for 30 seconds. The process-local server cache coalesces concurrent work and is bounded to 100 entries / 32 MiB, with a 4 MiB per-entry ceiling. Every private server cache hit first validates the Redis session. Cache keys include a hash of the session and the complete query; errors, exports, OAuth and mutations are not cached. Each API response keeps the normal rate limits, request IDs and private/no-store CDN headers. X-Data-Captured-At preserves the age of the reading.

The browser uses a bounded memory/sessionStorage cache, partitioned by a server-validated opaque session scope. A reload makes one lightweight /api/session request before displaying private cached data; fresh telemetry is reused without requesting it again. Visible views revalidate every 30 seconds. Older readings can be shown for up to five minutes while refreshing, with age/loading/error indicators; 401/403 clear the cache, account changes use a new scope, and logout/import invalidate it. No OAuth tokens or credentials are stored in this cache. Hidden tabs pause polling, concurrent polls do not overlap, and explicit refresh bypasses the freshness window. Caches are per process/tab; Redis remains the source of truth for sessions and distributed rate limits.

### Runtime configuration and deployment

Production startup validates required Console, adapter, Discord, and selected-storage settings before serving requests. Public app/callback URLs require HTTPS (loopback HTTP is allowed for local fixtures or tunnels); callback and app origins must match. Console HTTP is supported for a trusted private deployment network. Builds can run without deployment credentials; runtime startup requires them.

Build and check the exact release with:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:production
npm run test:browser
```

Run the application behind a TLS reverse proxy using `npm run start -- --hostname 127.0.0.1`. The proxy must overwrite forwarded client/protocol headers, and the Next.js port must not be exposed directly to untrusted traffic. Use a process manager and deploy frontend/API code from the same build. Keep Redis credentials and .env outside source control, retain the previous build for rollback, and leave API_DEBUG_ENABLED=false for normal operation.

Release validation includes live Redis PING, an isolated expiring Redis Lua counter/expiry probe, and Console authentication plus a read-only player-list request. These passed from the local machine. Live Discord OAuth and an actual in-game blueprint delivery must still be confirmed in the deployed environment; automated tests do not submit game mutations or deploy the service.
