# Arrakis Control Dashboard

Arrakis Control is a Next.js dashboard for authorized Dune server operations. It provides Discord OAuth login, player telemetry, base and vehicle data, market information, map data, and base export functionality.

The public landing page is `/`; legacy `/home` links redirect there while preserving query parameters. The signed-in workspace is `/portal`.

Sharing `/` or `/portal` in Discord provides a server-rendered component card with public feature summaries, the community mark, and **Visit website**, **Open portal**, and **Join Discord** link buttons. Open Graph and Twitter metadata provide a standard image-card fallback. The canonical URLs use `APP_URL`, never request headers or member data; no preview URLs are emitted when that setting is absent. Copy and links live in `src/modules/sharing/metadata.ts`, and versioned PNGs in `src/assets/share/` use the existing hardened asset route. After deployment, check the public URL in [Discord's Embed Debugger](https://discord.com/developers/embeds); Discord controls preview availability and caching.

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
- `REDIS_URL` (self-hosted Redis TCP connection URL) for shared rate limits, persistent sessions, and the dashboard snapshot cache.
- `REDIS_CLUSTER_NODES` (optional) comma-separated `host:port` list that switches the optional server snapshot provider to `ioredis` Cluster with automatic failover; `REDIS_URL` still supplies credentials, TLS, and the database index.

Optional server binding variables:

- `SERVER_HOSTNAME` selects the interface or hostname to bind. It defaults to `127.0.0.1`.
- `SERVER_PORT` selects the TCP port. It defaults to `2008` and must be between `1` and `65535`.

See [.env.example](.env.example) for the complete configuration template.

## Administration

`/admin` is restricted on the server to the OAuth-verified Discord user `456084885220884480`. That account must still belong to `DISCORD_GUILD_ID`, have the configured `VERIFIED_MEMBER_ROLE_ID`, and have a valid unexpired dashboard session. Administration links appear only for that verified account. Client-side flags, caller-supplied IDs, Discord bot credentials, and ordinary member sessions never grant administrative access.

Set optional `ADMIN_CONSOLE_API_KEY` to a **separate** scoped Console API key with only the permissions needed for your administrative tasks. Keep the ordinary `CONSOLE_API_KEY` at the minimum scopes needed for existing member features, including owned-base imports if enabled; do not broaden it for administration. The admin key is never returned to the browser; the Pterodactyl egg marks this privileged variable hidden and non-editable for ordinary panel users. Console administration remains disabled while it is empty. Adapter operations use only `ADAPTER_TOKEN`, with the actor identity built from the verified dashboard session. HTTPS is required for remote Console administration; HTTP is permitted only on loopback.

The searchable catalog at `src/modules/admin/catalog.json` contains all 378 unique method/path operations from the supplied August 2026 reference (379 rows, including one duplicate player-vehicle route). It includes server operations, players, guilds, bases, storage, vehicles, exchange/market automation, blueprints, maps, admin tools, care packages, addons, monitoring, IAM, API-key management, setup, database, and adapter entries. Select an operation, enter its path/query/body parameters, and inspect the bounded sanitized response. List responses have a table preview; nested responses have a JSON inspector. The catalog is an explicit allowlist: requests cannot select arbitrary provider URLs or headers.

**API-key restrictions remain enforced.** The reference permanently denies setup, database, and settings namespaces (including IAM, Console login, and key management) to API keys; update/addon writes are also unavailable, except documented read-only update checks. Planned/unsupported operations are labeled in the catalog. Restricted entries link to the Console for use with its own browser authentication; this dashboard does not reinstate Console password login, cookies, CSRF, or reauthentication. Even an eligible entry may be refused by the configured key's scopes or the installed Console's capabilities/version. No live Console capability claim is made by the catalog.

Every administration request revalidates the session. Execution and uploads require same-origin POSTs. For writes, type the exact method/path confirmation shown by the workspace and include any native Console confirmation phrase in the request fields. Native restore-preview, backup, ownership, schema-capability, and restart-queue requirements are preserved; no operation bypasses them. Writes are never retried automatically. A timeout may leave a submitted task running: inspect Console state before retrying. Operational audit messages include the verified actor, operation ID, and upstream status, without request bodies, uploaded contents, passphrases, or credentials.

Transfers are intentionally bounded: uploads are at most 8 MiB combined with a 30-second receive deadline; downloads stream at most 128 MiB over 120 seconds; sanitized SSE log/task views run up to 60 seconds and 2 MiB. Use the Console directly for larger backups. JSON/text responses are bounded, secrets and legacy command output are redacted, unsafe integer identifiers remain strings, and previews show truncation. Native download forms stream directly into the browser rather than buffering archives in client JavaScript. All administration responses and personalized pages use private/no-store headers.

## Website announcements

The shared application shell loads the Announcify widget for project `cmvsu06fg00001v0xfjofkwxp`. Write and publish announcements in that project's Announcify dashboard; visitors read them through its floating launcher on the website. No private API key is required. The widget's API base is explicitly set to `https://announcify.app`, and the site security policy allows its script, API requests, announcement images hosted there, and Google Fonts stylesheet and font assets.

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

The interface uses a neutral charcoal design system with system sans-serif typography, shared surface and accent tokens, and responsive navigation. Holiday and seasonal rules change only the accent color, preserving the same surfaces and layout. Edit the shared tokens in `src/styles/global.css`; feature styles and metric cards consume them throughout the site.

The browser selects holiday and seasonal colors using its local calendar date before the page body renders. `src/modules/theme/schedule.ts` is the configuration matrix: each entry contains an ID, priority, inclusive date rule, palette, and optional asset/message metadata. Edit colors in `src/styles/global.css`. Assets and messages are metadata only; no banner or decoration is inserted, so theme changes do not alter layout.

Single-day holidays and holiday weekends take priority over longer holiday periods, which take priority over seasons. Equal priorities use matrix order (for example, Flag Day wins if Father's Day falls on June 14). Super Bowl Weekend means the Saturday and second Sunday of February, following the configured formula rather than a sports schedule. Easter uses the Western Gregorian calculation. Thanksgiving can continue into December. Winter ends February 28 as configured; February 29 uses `data-theme="default"`.

Preview any configured ID with `?theme=halloween`, `?theme=easter`, or `?theme=independence-day` (`july4th` is an alias). Use `?theme=default` to restore the original colors; remove the parameter to resume automatic selection. Unknown overrides are ignored. No environment setting or secret is needed. The controller rechecks at local midnight, on navigation/resume, and at least once a minute for system clock changes. If JavaScript is disabled or its request fails, the server-rendered default theme remains usable.

The calendar matrix in `src/modules/theme/schedule.ts` controls inclusive local dates, priorities, palettes, and optional `cssClass`, `message`, and `asset` metadata. The early controller applies the class and exposes the message/asset as text attributes on `<html>`; it never injects HTML or inserts a banner that could shift content. Only its own classes and metadata are removed on reset. `src/styles/pillbox-theme.css` connects the shared pillbox accent token to the same seasonal palette used by feature modules. No theme assets are downloaded unless a feature explicitly uses them.


## Interactive maps

Both maps open in an orbitable 3D view with measured terrain, selectable locations, and realtime markers. Drag to orbit, right-drag to pan, and scroll/pinch to zoom. Controls include location search, Fly to, compass, scale, fullscreen, and detail selection. The 2D map remains available and is the automatic fallback if terrain loading or WebGL2 fails.

Owned-base structures use the existing ownership-checked export endpoint and locally bundled models; vehicle and sandworm models retain bounded detail and distance limits. Renderer tests cover marker alignment, context-loss recovery, filters, and model selection. The Three.js scene loads only when a map opens. MapViewer3D attribution is in `src/modules/map/terrain/MAPVIEWER3D-LICENSE.txt` and is included in the production image.

The **My bases** workspace also offers an opt-in 3D preview. Choose an owned base and select **Load 3D preview** to fetch its authorized export; switching or closing the preview releases the renderer. Detailed and native meshes use the same coordinate system and exported actor/catalogue transforms, without template-name rotation guesses or left/right substitutions. Exported pentashield dimensions are applied in metres. **Building parts** lists per-template reconstruction counts; unsupported items and pieces outside the detail budget (4,000,000 triangles for detailed previews, 400,000 for native map models) are reported rather than replaced with generic geometry. Exports are bounded to 2 MiB and are never stored in browser persistence. The storage dialog provides independently scrollable containers and contents, pagination, search, and keyboard focus management across desktop and mobile layouts.

Choose a front when uploading JSON or sharing an owned base. Orbit to the entrance, use **Level front view** or **Fit whole base**, then select the picture. Captures fit every rendered piece into a 640 × 360 PNG with a margin. JSON uploads require a selected picture before import and offer it as a download; a Solido tool has no placed-base ID. For an owned base, **Take picture & save front** stores the view and picture in Redis, restores the view when reopening the preview, and updates its existing listing. **Change picture** on your marketplace cards opens the published layout so you can capture and save a replacement without uploading or publishing it again. The card updates immediately and keeps its publication date. Only the verified owner can replace the picture; the button is unavailable when ownership cannot be verified.

**Base market** cards load saved pictures directly, without model downloads, WebGL thumbnail rendering, or automatic front detection. Sharing requires a picture. Older listings retain their layouts but display **Picture required** and withhold the import action until their owner saves a picture under **My bases**. **Inspect base** opens the interactive viewer; **Import to my character** validates the shared layout and submits it through the same Solido import route as uploaded blueprints. Existing 512 KiB, claim-console, shield-format, linked-character, and duplicate-delivery protections still apply. Unsupported layouts show an error without submitting an import.

Spice fields (possible and active), shipwreck POIs, and flour-sand deposits have original procedural 3D representations. Resource patches follow measured terrain and omit unsupported triangles; filtering the corresponding layer removes its models. Only the nearest 40 world models are allocated, with distant blips retained. Leaving their range or changing terrain detail releases their geometry; no external model downloads are needed for these objects.

## Optional Realtime Data

Run the optional `mvagent` next to the Console using the [MapViewer3D ddp setup](https://github.com/dev-prophet-code/MapViewer3D/tree/ddp). Enable **Realtime Data → Read** on the dashboard's existing `CONSOLE_API_KEY`; `Maps → Read` does not grant this scope. Keep the agent's unauthenticated loopback endpoint private: the dashboard contacts only the Console, using `CONSOLE_URL` with HTTPS and a trusted certificate (HTTP is accepted only on loopback). `DUNE_REALTIME_AGENT_URL` belongs to the Console, not this dashboard.

Realtime creature and weather positions are available to every signed-in dashboard member of the configured guild. No additional Discord role or `REALTIME_ROLE_ID` setting is required; legacy values are ignored. Signed-out visitors cannot fetch positions, and logout/session revocation is checked on every request. The dashboard's normal Discord login requirements still apply.

On Hagga Basin or Deep Desert, realtime starts enabled; choose an instance or use the toggle to pause it. The layer polls `/api/realtime/objects` through the dashboard every two seconds while visible; it does not open SSE streams or consume stream slots. Errors clear old positions and retry after 30 seconds; dashboard authorization failures stop polling until toggled again. Missing agent, missing scope, unsupported Console versions and sources that are not ready show availability messages without interrupting the normal map. Each browser makes its own snapshot requests, so account for the Console API key's rate limit.

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
  -> proxy.ts (request correlation and security headers)
  -> src/pages/api/**
  -> runPagesApiHandler
  -> session and authorization checks
  -> feature route
  -> Dune Console or Discord
```

The public entry `/` serves the community landing page with
server-side session checks. `/portal` provides the signed-in workspace and reads
normalized telemetry through the existing feature APIs. The separate public
operations dashboard and its App Router shell have been removed.

Important boundaries:

- `src/pages/` contains the Pages Router pages and API routes; `next.config.ts` redirects legacy `/home` links to `/`.
- `src/modules/` contains feature-specific UI, hooks, normalization, and server helpers.
- `src/infrastructure/` contains the Dune client, cookie helpers, and API boundary utilities.
- `src/lib/` contains shared logging, errors, Redis (node-redis for sessions/rate limits, ioredis pool for dashboard data), rate limiting, and session storage.
- `src/lib/env.ts` validates server environment configuration; `src/config/env.ts` re-exports it for legacy imports.
- `proxy.ts` adds request correlation and security headers (Middleware renamed in Next.js 16; it must live at `src/proxy.ts` beside the routers).
- `docker-compose.yml` runs the dashboard beside a local Redis for development.
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

CI runs static checks and unit tests in parallel with a production build, runtime smoke checks, and browser tests. The final `verify` job requires both jobs to succeed. Superseded pull-request runs are canceled; main-branch runs are not canceled. The integration job caches only `.next/cache` and installs Chromium's headless shell for Playwright.

Releases still require successful main-branch CI. Docker Buildx reuses a separate GitHub Actions layer cache, loads the versioned image locally, and runs container content and startup checks before registry login, image publication, and GitHub Release creation. No image is pushed by the cached build step. Cache benefits depend on a prior successful cache export; the first run may be cold.

The dashboard expects the Dune Console and Discord provider to be reachable at runtime. Provider failures are logged with correlation IDs and returned as safe errors where possible. The local development fallback for Redis-backed state is intentionally not suitable for production.

At the default `INFO` level, successful background polling is omitted from the console so hosted logs remain readable. Set `LOG_LEVEL=DEBUG` when compact polling diagnostics are needed; warnings and failures remain visible at normal levels.
