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

## Optional Realtime Data

Run the optional `mvagent` next to the Console using the [MapViewer3D ddp setup](https://github.com/dev-prophet-code/MapViewer3D/tree/ddp). Enable **Realtime Data → Read** on the dashboard's existing `CONSOLE_API_KEY`; `Maps → Read` does not grant this scope. Keep the agent's unauthenticated loopback endpoint private: the dashboard contacts only the Console, using `CONSOLE_URL` with HTTPS and a trusted certificate (HTTP is accepted only on loopback). `DUNE_REALTIME_AGENT_URL` belongs to the Console, not this dashboard.

Both maps open in 3D with measured terrain, selectable markers, existing legend/realtime filters, and a terrain-following Deep Desert sector grid. Drag to orbit, right-drag to pan, and scroll/pinch to zoom; the toolbar and keyboard zoom/fit controls also operate the camera. **2D map** restores the overhead viewer. Terrain/image failures or WebGL2 context loss automatically restore 2D. Bases and vehicles remain selectable map markers; this integration does not reconstruct individual buildings or vehicle models.

The 3D integration uses [MapViewer3D](https://github.com/dev-prophet-code/MapViewer3D)'s height encoding and Unreal-to-three.js coordinate convention, with its MIT notice in `src/modules/map/terrain/MAPVIEWER3D-LICENSE.txt`. Hagga's bundled 8 m elevation grid was assembled from checksum-verified level-3 `survival_1` CDN tiles (index SHA-256 `8cd4730a5ac01f069dee90992d21ee8455fbfa58e0411478f277ec4e54f3d13e`, retrieved 2026-10-19). Deep Desert uses the existing layout 0–11 height fields and instanced rock meshes. Surface meshes use at most 513 × 513 vertices and local 2048 px map textures; all assets are served locally through the hardened asset route, with no browser credentials or third-party runtime requests.

Realtime creature and weather positions are available to every signed-in dashboard member of the configured guild. No additional Discord role or `REALTIME_ROLE_ID` setting is required; legacy values are ignored. Signed-out visitors cannot fetch positions, and logout/session revocation is checked on every request. The dashboard's normal Discord login requirements still apply.

On Hagga Basin or Deep Desert, realtime starts enabled; choose an instance or use **Realtime on** to turn updates off. NPCs and civilians start hidden in the legend and can be enabled individually; saved layer choices are preserved. The layer polls `/api/realtime/objects` through the dashboard every two seconds while visible; it does not open SSE streams or consume stream slots. Errors clear old positions and retry after 30 seconds; dashboard authorization failures stop polling until toggled again. Missing agent, missing scope, unsupported Console versions and sources that are not ready show availability messages without interrupting the normal map. Each browser makes its own snapshot requests, so account for the Console API key's rate limit.

The layer adds sandworms, NPCs, civilians, sandstorms and Coriolis storms, with individual legend filters. Anonymous agent player/vehicle objects are excluded because they cannot satisfy the dashboard's identity and ownership checks. Existing player/vehicle markers continue using their normal map refresh. Instance selection applies to realtime markers only.

Background reads update markers in place without resetting the viewport or showing a loading state. Position-only snapshots leave the 3D terrain untouched, and moving 3D markers glide between samples (respecting reduced-motion settings). Errors still clear unavailable realtime positions and show the provider status.

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

For cloud testing without a version bump, wait for `main` CI to pass and manually run **Cloud test image** from GitHub Actions on `main`. It smoke-tests the container and publishes `ghcr.io/realxkenny/arrakis-control-dashboard:cloud-test` plus `sha-<full commit>`; stable tags and GitHub Releases stay unchanged. Set the test server's Docker image to that test tag and pull/recreate the container to use the new build.

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
