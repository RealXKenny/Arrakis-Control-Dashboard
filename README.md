# Arrakis Control Dashboard

Arrakis Control is a Next.js dashboard for authorized Dune server operations. It provides Discord OAuth login, player telemetry, base and vehicle data, market information, map data, and base export functionality.

The application uses the Next.js Pages Router and keeps external service credentials and authorization decisions on the server.

## Requirements

- Node.js 22 or newer
- npm
- A Dune Console instance and adapter token
- A Discord application configured for OAuth2
- A self-hosted Redis server for production deployments

## Quick Start

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The development server listens on `http://127.0.0.1:2008` by default. Set `SERVER_HOSTNAME` and `SERVER_PORT` in `.env` to choose a different bind address for both `npm run dev` and `npm start`. Next.js command-line options still override `.env` for a single run, for example `npm run dev -- --hostname 0.0.0.0 --port 3000`.

The launcher probes the local `/portal` page for up to 60 seconds and prints `Arrakis Control Dashboard is listening` once an HTTP check succeeds. The Pterodactyl egg uses this message as its startup completion marker. Checks stop when the child exits or shutdown begins.

Fill in `.env` before using authentication or server-backed features. Never commit `.env` or place server secrets in variables beginning with `NEXT_PUBLIC_`.

## Environment

Required production variables include:

- `CONSOLE_URL`, `CONSOLE_API_KEY`, and `ADAPTER_TOKEN` for scoped Dune Console access.
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_GUILD_ID` for Discord OAuth.
- `APP_URL` and `VERIFIED_MEMBER_ROLE_ID` for redirects and role authorization. The OAuth callback is always `<APP_URL>/auth/callback`.
- `REDIS_URL` (self-hosted Redis TCP connection URL) for shared rate limits and persistent sessions.

Optional server binding variables:

- `SERVER_HOSTNAME` selects the interface or hostname to bind. It defaults to `127.0.0.1`.
- `SERVER_PORT` selects the TCP port. It defaults to `2008` and must be between `1` and `65535`.

See [.env.example](.env.example) for the complete configuration template.

## Discord bot API

Set optional `BOT_API_TOKEN` to an independently generated 32–256 character secret in the dashboard and your bot's secret store. This credential is distinct from the Discord bot token, `CONSOLE_API_KEY`, and `ADAPTER_TOKEN`. Empty means disabled. Rotate it by replacing the value on both services and restarting the dashboard; it is never sent to browsers. The egg exposes this optional setting too.

`GET /api/v1/bot/world?map=HaggaBasin` (or `DeepDesert`) returns `{ "ok": true, "apiVersion": "1", "data": { ... } }` with the dashboard's sanitized shared world summary: spice sectors, market counts, council summary, population history, and aggregate play hours. Missing provider data stays null. The response uses private/no-store headers. It exposes no individual profiles, inventory, base exports, raw Console payloads, mutations, or user impersonation. The service credential is authorized for this configured dashboard guild's shared data only.

```js
const response = await fetch(`${process.env.DASHBOARD_URL}/api/v1/bot/world?map=DeepDesert`, {
  headers: { Authorization: `Bearer ${process.env.BOT_API_TOKEN}` },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`Dashboard returned HTTP ${response.status}`);
const { data } = await response.json();
// Format data into your Discord command response. Never log the Authorization header.
```

Use a server-side bot process. Do not put tokens in query strings or browser code. The bot budget is 60 reads/minute across all its source addresses and all dashboard workers, in addition to normal IP/route protection. Cache Discord command results briefly. Honor `Retry-After` on 429/503 with backoff and jitter; do not retry 400/401/403. Unsupported HTTP methods return 405. Authentication errors are 401; an unconfigured bot API returns 503. All errors include a sanitized request ID.

## Capacity and load testing

800,000 concurrent users is a deployment target, **not a verified capacity claim**. At one request every 30 seconds they generate about 26,667 requests/second; if all enable two-second realtime polling, that alone generates 400,000 requests/second. Page loads, session checks, assets, retries, and other API reads add traffic.

The application now rejects excess API work immediately with `503 SERVER_BUSY` and `Retry-After: 2`, coalesces realtime reads for one second per map per worker (including brief failure cooldowns), and caches population history with the 30-second world snapshot. Every realtime request still revalidates its session and guild. Read-cache overflow rejects new work rather than starting unbounded provider requests. These caches are **per worker**, not distributed snapshot caches; adding replicas still adds provider traffic. Private caches and browser no-store headers remain intact.

`API_MAX_CONCURRENCY` defaults to 100 active API requests per worker, including Redis checks. `API_GLOBAL_READ_LIMIT` defaults to 2,400 requests/minute per read route, shared through Redis across replicas. Sensitive routes retain their 600/minute shared budget. Per-address limits stay at 120 reads/minute and 30 sensitive requests/minute. These conservative defaults intentionally do not permit 800k-user traffic: raise budgets only after measured capacity tests. Set the same global budget across replicas. Keep trusted reverse proxies responsible for replacing untrusted forwarded-IP headers, otherwise address-based limits can be bypassed.

Use a reverse proxy/load balancer with edge admission controls and multiple identical application replicas, shared production Redis, and CDN delivery for appropriate static assets. Never override private/no-store headers to cache authenticated API responses. Before a target-scale launch, provision and test the fleet, Redis throughput/memory/failover, network egress, provider quotas, and a shared snapshot/collector layer so Console load does not grow with replica count. Verify logout/revocation across replicas, upstream failures, and rolling deployments. One Pterodactyl container cannot be assumed to provide this capacity. See the [Next.js self-hosting guide](https://nextjs.org/docs/pages/guides/self-hosting).

An optional [k6 arrival-rate harness](tests/load/dashboard.k6.js) is included. It uses one request per iteration, fails on dropped iterations, HTTP errors (including 429/503), and excessive latency. Install k6 separately, start an isolated production test deployment with fake upstream services and test credentials, then run:

```powershell
k6 run tests/load/dashboard.k6.js
# Start within the IP budget; scale with distributed staging generators. VUS sizes the generator.
$env:BASE_URL = 'http://127.0.0.1:2008'
$env:RATE = '1'
$env:VUS = '50'
$env:DURATION = '2m'
k6 run tests/load/dashboard.k6.js
```

Protected workloads accept `TARGET_PATH=/api/map/realtime?map=HaggaBasin` and `SESSION_COOKIE` containing a staging session cookie. A single cookie/address tests a narrow request path, **not 800,000 independent users**; ordinary IP limits will reject higher rates from one generator address. A target-scale validation requires distributed generators, representative user/session diversity, a realistic route mix, and a soak test. Record achieved throughput, p95/p99 latency, error rate, dropped iterations, RSS, CPU/event-loop delay, Redis latency/queue depth, and upstream request rate. Stop raising load when thresholds fail. The harness follows [k6 arrival-rate allocation guidance](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/).

## Automatic themes

The browser selects holiday and seasonal colors using its local calendar date before the page body renders. `src/modules/theme/schedule.ts` is the configuration matrix: each entry contains an ID, priority, inclusive date rule, palette, and optional asset/message metadata. Edit colors in `src/styles/global.css`. Assets and messages are metadata only; no banner or decoration is inserted, so theme changes do not alter layout.

Single-day holidays and holiday weekends take priority over longer holiday periods, which take priority over seasons. Equal priorities use matrix order (for example, Flag Day wins if Father's Day falls on June 14). Super Bowl Weekend means the Saturday and second Sunday of February, following the configured formula rather than a sports schedule. Easter uses the Western Gregorian calculation. Thanksgiving can continue into December. Winter ends February 28 as configured; February 29 uses `data-theme="default"`.

Preview any configured ID with `?theme=halloween`, `?theme=easter`, or `?theme=independence-day` (`july4th` is an alias). Use `?theme=default` to restore the original colors; remove the parameter to resume automatic selection. Unknown overrides are ignored. No environment setting or secret is needed. The controller rechecks at local midnight, on navigation/resume, and at least once a minute for system clock changes. If JavaScript is disabled or its request fails, the server-rendered default theme remains usable.

## Optional Realtime Data

Run the optional `mvagent` next to the Console using the [MapViewer3D ddp setup](https://github.com/dev-prophet-code/MapViewer3D/tree/ddp). Enable **Realtime Data → Read** on the dashboard's existing `CONSOLE_API_KEY`; `Maps → Read` does not grant this scope. Keep the agent's unauthenticated loopback endpoint private: the dashboard contacts only the Console, using `CONSOLE_URL` with HTTPS and a trusted certificate (HTTP is accepted only on loopback). `DUNE_REALTIME_AGENT_URL` belongs to the Console, not this dashboard.

Realtime creature and weather positions are available to every signed-in dashboard member of the configured guild. No additional Discord role or `REALTIME_ROLE_ID` setting is required; legacy values are ignored. Signed-out visitors cannot fetch positions, and logout/session revocation is checked on every request. The dashboard's normal Discord login requirements still apply.

On Hagga Basin or Deep Desert, turn **Realtime on** and choose an instance. The layer polls `/api/realtime/objects` through the dashboard every two seconds while visible; it does not open SSE streams or consume stream slots. Errors clear old positions and retry after 30 seconds; dashboard authorization failures stop polling until toggled again. Missing agent, missing scope, unsupported Console versions and sources that are not ready show availability messages without interrupting the normal map. Each browser makes its own snapshot requests, so account for the Console API key's rate limit.

The layer adds sandworms, NPCs, civilians, sandstorms and Coriolis storms, with individual legend filters. Anonymous agent player/vehicle objects are excluded because they cannot satisfy the dashboard's identity and ownership checks. Existing player/vehicle markers continue using their normal map refresh. Instance selection applies to realtime markers only.

## Commands

```text
npm run dev            Start the local development server
npm run build          Create the optimized production build
npm start              Start the production server
npm run typecheck      Run TypeScript validation
npm run lint           Run ESLint
npm test               Run Vitest once
npm run test:watch     Run Vitest in watch mode
npm run test:coverage  Run tests with V8 coverage
```

CI runs typecheck, lint, tests, the production build, production smoke checks, and browser checks for pushes to `main` and pull requests. After successful `main` CI, the release workflow publishes a Docker image only when `package.json` has a new stable version with a matching changelog section.

## Docker and Pterodactyl

The production image is published as [`ghcr.io/realxkenny/arrakis-control-dashboard:latest`](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pkgs/container/arrakis-control-dashboard). Each new version release updates `latest` and adds `v<version>` and `sha-<commit>` tags; ordinary pushes leave the published image unchanged. The image contains the built Next.js app, bundled assets, and changelog; do not run `npm install` in the server's `/home/container` directory.

Import [the dashboard egg](pterodactyl/egg-arrakis-control-dashboard.json) into a Pterodactyl nest, create a server with its GHCR image, and assign a port. Pterodactyl supplies that allocation as `SERVER_PORT`; the egg binds `SERVER_HOSTNAME` to `0.0.0.0`. Leave its startup command pointing at `/opt/arrakis-dashboard` because the app is in the image, not `/home/container`. Use the egg's Startup settings to fill every required variable before starting the server.

Set `APP_URL` to the public HTTPS origin served by your reverse proxy, then configure the Discord OAuth redirect URI as `<APP_URL>/auth/callback`. The assigned port is the dashboard's internal HTTP port; terminate public HTTPS at the proxy. `CONSOLE_URL` and `REDIS_URL` must resolve and be reachable from inside the container. Use `rediss://` when Redis requires TLS. If the GHCR package is private, grant the Pterodactyl host access to pull it or make the package public.

For a direct Docker deployment, supply the required production variables with `--env-file` and map the same port on the host and container; set `SERVER_HOSTNAME=0.0.0.0`. Keep the environment file outside the image and repository.

## Releases

To publish a release, update the `version` in `package.json` and add a matching `## [X.Y.Z] - YYYY-MM-DD` section to [CHANGELOG.md](CHANGELOG.md) in the same change. After the `main` branch CI succeeds, the release workflow creates the version tag and GitHub Release using that section. Stable semantic versions must increase; unchanged versions do not create releases.

## Architecture

```text
Browser
  -> middleware.ts
  -> src/pages/api/**
  -> runPagesApiHandler
  -> session and authorization checks
  -> feature route
  -> Dune Console or Discord
```

Important boundaries:

- `src/pages/` contains Next.js pages and API routes.
- `src/modules/` contains feature-specific UI, hooks, normalization, and server helpers.
- `src/infrastructure/` contains the Dune client, cookie helpers, and API boundary utilities.
- `src/lib/` contains shared logging, errors, Redis, rate limiting, and session storage.
- `src/config/env.ts` validates server environment configuration.
- `middleware.ts` adds request correlation and security headers.
- `tests/` contains focused unit and API-boundary tests.

## Security and Reliability

- API routes receive request IDs, method checks, structured logging, safe error responses, and shared rate limiting.
- Production rate limits use Redis and fail closed if the storage service is unavailable.
- OAuth sessions use Redis TTL records; cookies contain only random opaque session IDs.
- OAuth access tokens are not persisted.
- Logs redact passwords, tokens, cookies, authorization headers, and session values.
- Security headers are applied by middleware, including CSP, frame protection, referrer policy, and HSTS in production.
- External requests use bounded timeouts and safe retry behavior where applicable.

## Production Deployment

1. Provision a Redis server reachable over TCP and configure `REDIS_URL` with any required credentials.
2. Configure Discord OAuth redirect URI as `<APP_URL>/auth/callback`.
3. Set all required server-only variables from `.env.example` in the deployment platform.
4. Run the verification commands locally or in CI:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

5. Start with `npm start` and monitor application logs.

Do not deploy with placeholder environment values, disabled HTTPS, or missing Redis credentials. Redis is required in production because sessions and rate limits must work across instances and survive restarts.

## Operational Notes

The dashboard expects the Dune Console and Discord provider to be reachable at runtime. Provider failures are logged with correlation IDs and returned as safe errors where possible. The local development fallback for Redis-backed state is intentionally not suitable for production.

At the default `INFO` level, successful background polling is omitted from the console so hosted logs remain readable. Set `LOG_LEVEL=DEBUG` when compact polling diagnostics are needed; warnings and failures remain visible at normal levels.
