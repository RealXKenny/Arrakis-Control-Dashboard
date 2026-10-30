# Changelog

All notable changes to Arrakis Control Dashboard are documented here.

## [Unreleased]

## [1.20.4] - 2026-10-30

### Added

- Add matching Dune vehicle icons to portal vehicle cards.
- Rebind FModel layer atlases and normal maps for 12 machinery props used by base 2010.
- Rebind FModel material layers for 57 building and prop meshes used by base 1250.
- Move the owned-base preview into its own full-screen tab with desert scenery and day/night lighting.
- Organize the top pill navigation into separate Bases and Vehicles categories, including Base Market under Bases.
- Show base-preview loading progress and render a fast native preview while detailed meshes and textures load for large bases.

### Changed

- Load saved base camera settings alongside the private base export and load distinct detailed meshes concurrently.
- Refresh detailed preview assets when reloading a base preview.

### Fixed

- Apply inherited FModel layer color tints when building preview texture atlases.
- Apply per-layer FModel color override tints when rebuilding base prop atlases.
- Fill checker-only used material layers from the nearest real surface in the same material instead of flat gray.
- Skip texture binding on visual meshes without UV coordinates so they do not render from a single dark texel.
- Omit the unrelated pentashield collision proxy for animated Desert Mechanic door previews.
- Revalidate the visual mesh catalog on preview loads so rebuilt texture packs appear without stale cached entries.
- Replace the misleading authorization caption with a clear base-preview loading message.
- Keep large-base previews available when detailed assets cannot finish loading by retaining the fast preview.

## [1.20.3] - 2026-10-29

### Added

- Choose a base front and capture a picture when uploading or sharing, with framing that fits the whole rendered base.
- Save owned-base front views and pictures in Redis and restore the selected view when reopening the preview.
- Add **Change picture** to the owner's existing marketplace listings, including older listings, without republishing their layouts or changing publication order.

### Changed

- Replace automatic front detection and generated WebGL thumbnails with owner-selected PNG pictures that load directly on marketplace cards.
- Require a picture before sharing; existing listings without pictures retain their layouts and prompt their owners to add a picture before marketplace import becomes available.

## [1.20.2] - 2026-10-28

### Added

- Add the Announcify announcement widget across the website, connected to the community project with an explicit API origin and required security-policy permissions.
- Show a lazily generated straight-on base image above marketplace piece counts, with bounded sequential rendering and released GPU resources.
- Add **Import to my character** beside **Inspect base**, reusing the existing validated, idempotent Solido delivery flow and keeping unsupported-layout restrictions.

### Fixed

- Re-enable on-demand 3D previews for owned bases and shared marketplace layouts, including camera and base-facing controls.
- Unify detailed and native model coordinate systems and apply exported actor transforms plus catalogue offsets, rotations, and scales to every piece. Remove name-based yaw overrides, mirroring, and left/right substitutions.
- Show published bases in the Base Marketplace by querying Redis listing positions instead of positive score bounds, preserving newest-first ordering and bounded reads.

## [1.20.1] - 2026-10-27

### Added

- Add a base-facing control so users can compare piece placement at a consistent 0° heading.
- Port the reference engine's UE position and piece-yaw transforms into the local base-preview renderer.
- Render vertical and horizontal pentashield surfaces in the owned-base preview using their native proxy geometry and translucent shield materials.
- Add a Base Marketplace with ownership-checked publishing, idempotent Redis-backed community listings, author and size filters, sanitized downloads, and lazy 3D shared-base previews.

### Changed

- Disable owned-base and marketplace 3D previews pending a follow-up update.
- Preserve per-piece placement while allowing the whole preview to use a repeatable base heading.
- Embed available FModel surface color and normal textures in the owned-base 3D preview. Unreal layered materials without usable surface maps retain their existing fallback appearance.
- Render available Atreides Outpost color layers using their exported layer index maps, and retain fallback materials where shader inputs are unavailable.
- Allow larger base previews and preserve the reference project’s identified inclined-wall offsets. Retain native Atreides stair and ramp orientation and use the reference left/right mesh substitutions for wide ramp edges and floor triangles.
- Allow the expanded visual model catalog to serve three-digit pack numbers.
- Rebuild the landing page and shared application shell with a muted zinc bento grid, floating glass pill navigation, live-map entry points, and real public server counts.
- Standardize portal, admin, market, base, map, form, table, and dialog surfaces with soft borders, rounded controls, legible muted text, and no legacy glows or heavy shadows. Remove obsolete visual components, duplicated overrides, and inline UI tokens.
- Keep the glass navigation sticky at `z-50`, replace the text monogram with the official favicon through `next/image`, and expand the Exchange stats and listing grid to full width after removing its sidebar cards and obsolete price-ladder selection flow.
- Keep vehicle access tabs visible for empty shared results, replace container-vehicle fuel gauges with reported cargo or weight capacity, and refine the responsive vehicle cards and empty states.

## [1.2.0] - 2026-10-26

### Added

- Orbitable 3D Hagga Basin and Deep Desert maps with measured terrain, local building/vehicle/sandworm models, location search, compass, scale, fullscreen, terrain detail controls, and automatic 2D fallback. Restore the livemap implementation already present in merge history.
- Terrain-conforming procedural models for active/possible spice fields, shipwreck POIs, and flour-sand deposits, with layer-aware picking, a nearest-40 allocation budget, distant marker fallbacks, and geometry disposal when filters, distance, or detail change.
- An opt-in owned-base 3D preview in My bases, using authorized exports and actual local building/furniture meshes. Include orbit, zoom, fit and top-view controls, per-template reconstruction counts, native item transforms, and exported pentashield dimensions.
- Server-rendered Discord component link previews with the Crimson Skies mark, public feature summaries, and website/portal/Discord buttons. Include Open Graph/Twitter image fallbacks and small, allowlisted brand images.
- A server-only ioredis pool and snapshot-provider infrastructure with connection reuse, optional Redis Cluster configuration, failover, and a circuit breaker. The member portal continues to use its existing feature APIs.
- A canonical server environment schema in `src/lib/env.ts`, re-exported through `src/config/env.ts`, and a local development Docker Compose configuration with Redis.

### Changed

- Unify landing, portal, maps, inventory and dialogs around a charcoal-and-silver pillbox interface, modern typography, rounded controls, responsive mobile layouts, and fluid ultrawide spacing.
- Serve the public landing page directly at `/`; redirect legacy `/home` links with query parameters intact and remove the separate public operations dashboard and App Router shell. Keep the Pages Router feature architecture.
- Make the Crimson Skies brand in every topbar return to `/`. Remove extra public navigation pills and administration entry links while preserving direct `/admin` authorization.
- Redesign map toolbars, layer controls and location details as matching responsive cards with a dark canvas surround.
- Modernize base storage with independently scrolling containers and contents, reachable pagination, search, clear empty states, mobile layouts, and keyboard focus containment/restoration.
- Connect the holiday/seasonal calendar to the shared accent palette, including local-date selection, floating holidays, midnight/resume refresh, explicit default overrides, and cleanup of optional theme metadata without layout changes.
- Add Three.js and its development types; retain the modern Tailwind toolchain. Rename Middleware to `src/proxy.ts` for Next.js 16 and use a cached multi-stage Node 22 Alpine image running as the unprivileged Pterodactyl container user.
- Include the MapViewer3D MIT attribution in the runtime image. Synchronize the package and lockfile at stable version 1.2.0.

### Fixed

- Distinguish static POIs that share provider IDs by location and deduplicate repeated samples before rendering. Project markers and terrain from the same camera frame, canceling interpolation during camera changes to stop blips sticking during rapid zoom.
- Release 3D geometry, instanced meshes, controls, observers and graphics contexts when closing or switching previews; bound model detail, export sizes, loading concurrency and request timeouts.
- Keep dense high-detail alignment coverage for each map in its own browser test and batch framebuffer sampling into one readback per draw, avoiding software-renderer timeouts while retaining 450 markers and rapid zoom reversals.
- Start Discord OAuth only on intentional sign-in navigation rather than a background link prefetch.
- Align the Docker image's home/working directory and OCI description with Pterodactyl release checks; verify bundled model, terrain, share-image and license assets before publishing.

### Security

- Preserve server-side session, guild/role, exact administrator identity and base-ownership checks; never expose shared-base exports through the owned-base preview.
- Keep all credentials server-side, private exports out of browser persistence, and existing method checks, same-origin mutation checks, rate limits, security headers and response bounds intact.
- Build public share URLs only from `APP_URL`, ignore untrusted request hosts and query data, and keep member telemetry out of embeds. Bound Discord component JSON to 3,000 bytes and allowlist the public PNG assets.

### Verification

- Formatting, TypeScript, zero-warning lint, 333 unit/API tests, production build, runtime/API smoke checks, and 41 Chromium browser tests pass.
- Browser coverage includes mobile/ultrawide layouts, rapid-zoom marker alignment, dense terrain markers, resource models, base preview ownership/context-loss handling, storage pagination/focus, pre-paint themes, and crawler-visible Discord metadata under CSP.
- Capacity for 800,000 concurrent users remains unverified; distributed infrastructure sizing and staging load tests are still required.
- The community base marketplace and creator rewards remain future plans and are not included in this release.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.1.3...v1.2.0)

## [1.1.3] - 2026-10-26

### Added

- Administrator workspace at `/admin`, restricted server-side to Discord user `456084885220884480` with a valid configured-guild session and required role.
- Searchable catalog covering all 378 unique operations in the supplied Console API reference, with parameter forms, response tables, JSON inspection, explicit write confirmations, uploads, downloads, and sanitized log streaming.
- Separate optional `ADMIN_CONSOLE_API_KEY`, hidden from ordinary Pterodactyl panel users; preserve native API-key scope restrictions and label browser-only, planned, and unsupported operations.

### Changed

- Replace the Dune-inspired interface with a neutral charcoal design system, modern typography, simpler navigation, rounded cards, and consistent styling across the dashboard, maps, inventory, market, and dialogs.
- Redesign the landing page with workspace shortcuts and a lightweight community card; remove the embedded Discord widget and unused display-font downloads.
- Keep automatic holiday and seasonal themes as subtle accent changes without changing the shared surfaces or layout.
- Refine the interface to near-black, graphite, and silver instead of navy and blue, with muted seasonal accent tints.

### Security

- Revalidate the administrator's OAuth identity, guild, required role, and session on every administrative request; require same-origin POSTs and explicit confirmations for changes.
- Keep privileged credentials server-side, redact bounded response previews and log streams, validate download filenames, and cap upload/download transfers.
- Preserve native Console scope restrictions, restore-preview requirements, and restart-queue responses; never retry uncertain mutations automatically.

### Verification

- Formatting, TypeScript validation, zero-warning lint, 275 Vitest tests, production build, runtime smoke checks, and 26 Playwright browser tests pass.
- Live privileged Console operations remain dependent on deployment configuration, key scopes, and installed Console capabilities.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.1.2...v1.1.3)

## [1.1.2] - 2026-10-26

### Added

- Automatic holiday and seasonal color themes based on the visitor's local date, including floating holidays, Easter, explicit priorities, midnight updates, and default-theme fallback.
- URL theme previews such as `?theme=halloween`, `?theme=july4th`, and `?theme=default`, with an extensible configuration matrix and CSP-compatible initialization before the page body renders.
- Read-only Discord bot endpoint at `/api/v1/bot/world`, using an independent optional `BOT_API_TOKEN` to access sanitized guild-wide world summaries without user impersonation or mutation access.
- Configurable `API_MAX_CONCURRENCY` and `API_GLOBAL_READ_LIMIT` settings, optional bot credentials in the environment template and Pterodactyl egg, and a staging k6 load-test harness with deployment guidance.

### Changed

- Coalesce authorized realtime snapshots for one second per map per worker, including brief failure cooldowns, while preserving per-request session and guild checks.
- Cache population history with shared world summaries to reduce repeated Redis reads, and bound development rate-limit storage.
- Reject excess API and read-cache work with `503 SERVER_BUSY` and `Retry-After` instead of starting unbounded provider requests.
- Announce HTTP readiness once after a successful local listener check, cancel readiness probes during shutdown, and update the Pterodactyl startup marker to `Arrakis Control Dashboard is listening`.

### Security

- Keep bot credentials separate from Discord, Console, and adapter tokens; validate bearer credentials with constant-time digest comparison and enforce a shared credential-wide request budget.
- Preserve private/no-store API responses, normalized provider payloads, browser session authorization, and the existing Content Security Policy.

### Verification

- Formatting, TypeScript validation, zero-warning lint, 250 Vitest tests, production build, runtime smoke checks, and 24 Playwright browser tests pass.
- Capacity for 800,000 concurrent users remains unverified and requires infrastructure sizing and distributed load testing. The optional k6 harness has not been executed in this environment.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.1.1...v1.1.2)

## [1.1.1] - 2026-10-19

### Changed

- Make realtime sandworm, NPC, civilian, sandstorm, and Coriolis positions available to every signed-in dashboard member of the configured guild, without an additional staff role.
- Remove `REALTIME_ROLE_ID` from configuration and the Pterodactyl egg; existing values are ignored.
- Preserve signed-out access protection, per-request session checks, secure Console transport, and existing player and vehicle ownership restrictions.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.1.0...v1.1.1)

## [1.1.0] - 2026-10-19

### Added

- Optional realtime map layer for sandworms, NPCs, civilians, sandstorms, and Coriolis storms on Hagga Basin and Deep Desert, using Console snapshots refreshed every two seconds while the map is visible.
- Realtime toggle, instance selection, individual legend filters, moving marker details, and availability messages for missing agents, missing API scopes, unsupported Console versions, and sources that are not ready.
- Optional `REALTIME_ROLE_ID` configuration in the environment template and Pterodactyl egg, with setup instructions for the Console's **Realtime Data → Read** API key scope.
- Production Docker image with dashboard assets and changelog bundled, published to GitHub Container Registry for new stable version releases after successful `main` CI.
- Importable Pterodactyl egg with production environment settings and a no-op installer for the prebuilt image.
- Container startup and asset-route smoke checks before publishing a new versioned image.
- Add an OCI image description to the dashboard container metadata.

### Security

- Restrict realtime access to authenticated members of the configured guild with the configured staff role, rechecking the dashboard session on every snapshot request.
- Require HTTPS or loopback HTTP for realtime Console requests; keep bearer credentials server-side and normalize bounded provider payloads without exposing process metadata.
- Exclude anonymous agent player and vehicle objects to preserve existing identity and ownership checks. Clear old positions on failures, pause hidden maps, and stop polling after dashboard authorization failures.

### Verification

- Formatting, TypeScript validation, zero-warning lint, 171 Vitest tests, production build, runtime smoke checks, and 23 Playwright browser tests pass.
- Live agent connectivity requires deployment configuration and remains unverified.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.0.7...v1.1.0)

## [1.0.7] - 2026-09-20

### Fixed

- Removed successful 30-second browser polling from default `INFO` output so Pterodactyl logs stay focused on startup, authentication, user-triggered requests, warnings, and failures; compact polling diagnostics remain available with `LOG_LEVEL=DEBUG`.

### Verification

- Formatting, TypeScript validation, zero-warning lint, 156 Vitest tests, production build, and runtime smoke checks pass.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.0.6...v1.0.7)

## [1.0.6] - 2026-09-20

### Added

- User-selectable `SERVER_HOSTNAME` and `SERVER_PORT` settings in `.env` for both development and production startup, with validated defaults of `127.0.0.1:2008`.
- Regression coverage for configured bindings, invalid hostnames and ports, preserved defaults, and explicit Next.js command-line overrides.

### Changed

- Routed `npm run dev` and `npm start` through the server configuration launcher at `src/config/server-launcher.mjs` so `.env` is loaded before Next.js chooses its listening address.
- Documented the new binding settings in `.env.example`, `README.md`, and the repository map.

### Verification

- Formatting, TypeScript validation, zero-warning lint, 154 Vitest tests, production build, runtime smoke checks, and a live HTTP 200 response on a custom port pass.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.0.5...v1.0.6)

## [1.0.5] - 2026-09-20

### Added

- Automated GitHub Releases after successful `main` CI when `package.json` contains a new stable semantic version, including matching tag and release-note generation from this file.
- Release-note regression coverage that keeps `package.json`, `package-lock.json`, and the corresponding changelog section synchronized.
- An in-dashboard changelog dialog, backed by a local API, that displays every release when the footer version is selected without opening an external site.
- A compact `AGENTS.md` repository map covering architecture, runtime contracts, environment variables, map assets, release steps, and verification commands for faster Codex work.
- Lossless 8192×8192 Hagga Basin and Deep Desert maps assembled from four independently served 4096×4096 tiles per map.
- Layout-aware Deep Desert WebGL2 terrain that follows Console Coriolis layouts 0–11 using portable compressed RGBA textures, with a flat tiled-map fallback for unsupported browsers.
- An API-backed Deep Desert 9×9 sector overlay with A1–I9 labels, marker-sector projection, and a saved visibility control.
- A live, second-accurate Coriolis countdown in the map toolbar using the provider-reported next-cycle time.
- Per-item Market Board sell-price guidance calculated from the current lowest ask and server buyback percentage, rounded down to whole Solari with exact `BigInt` arithmetic.

### Changed

- Simplified the repository and moved all runtime images, item artwork, maps, and terrain bundles from `public` into `src/assets` behind the allowlisted asset API.
- Kept redacted `DEBUG` logging in the colored console while removing file logging, full operational stack traces, and redundant debug infrastructure.
- Made the startup banner clear the visible screen, scrollback, and cursor position first using terminal control sequences supported by local consoles and Pterodactyl's web terminal.
- Added a complete startup sequence that reports the runtime and environment, configuration validation, Dune Console connection, population-recorder activation, final readiness, and a clear startup failure when initialization cannot finish.
- Replaced verbose successful-request JSON events with normal access lines such as `GET /api/server/status → 200 (41ms)`.
- Suppressed identical successful polling logs by method, route, and status for five minutes, then reported the number of hidden repeats on the next line; warning and error logs remain unsuppressed with request IDs for troubleshooting.
- Switched Dune Console authentication to the scoped `CONSOLE_API_KEY` bearer flow and kept the adapter token as a separate credential.
- Consolidated environment configuration, normalized empty values, removed duplicate settings, and derived the Discord OAuth callback as `<APP_URL>/auth/callback`.
- Made population-history recording always active when Redis is available and removed the environment feature toggle.
- Redesigned the map workspace around the square atlas so the complete map fits on first load without side gutters, while retaining responsive desktop and mobile layouts.
- Stabilized map controls so wheel and button zoom remain user-controlled across scrollbar and viewport changes; automatic fitting now occurs only on initial load, map changes, responsive resizing before manual zoom, or an explicit **Fit map** action.
- Matched Deep Desert's default marker visibility to Hagga Basin, improved the toolbar and live status presentation, and consolidated all map styling into one feature stylesheet.
- Replaced stale or decorative comments with selectively placed `Dev note:` easter eggs mixing Dune humor, developer jokes, and corny dad jokes near the logic they describe.

### Security

- Strengthened Discord OAuth with strict and constant-time state validation, single-use callback cookies, bounded provider responses, validated identity fields, verified guild membership, and required-role enforcement.
- Added host-prefixed production session cookies, high-priority cookie attributes, stricter session-record validation, stale-session cleanup, and fail-closed behavior during storage errors.
- Added same-origin enforcement for mutations, sanitized request identifiers, bounded request and response bodies, hardened asset allowlists, and safer upstream error handling.
- Expanded browser protections with stricter Content Security Policy, frame denial, cross-origin isolation headers, HSTS in production, MIME sniffing prevention, referrer controls, and permissions restrictions.
- Extended recursive secret redaction and production error sanitization so credentials, cookies, authorization values, session identifiers, and internal stacks are not exposed through logs or API responses.

### Fixed

- Corrected Discord guild verification to use the current-user OAuth member endpoint required by the `guilds.members.read` scope.
- Removed an accidental trailing space from the Console map-marker request.
- Made terrain loading independent of rewrite configuration, exposed actionable fallback reasons, and retained the flat map when terrain initialization is unavailable.
- Replaced the optional browser BC7 texture-extension requirement with portable RGBA terrain data.
- Prevented React development Strict Mode from churning WebGL contexts during terrain startup and improved shader compile diagnostics.
- Moved terrain rendering, grid projection, and marker coordinates onto the same viewport-virtualized 8192×8192 coordinate space.
- Fixed initial map cropping, desktop side gutters, unused mobile map space, and zoom controls that previously snapped back while the user zoomed.
- Stabilized the real 8K-tile and WebGL browser regression for slower two-worker CI runners by using a CI-sized test budget, deterministic hidden-fallback tile checks, explicit mobile refitting, and rendering-safe geometry tolerances.
- Muted expected Console and Redis connection noise from the browser-test server while keeping production logging unchanged.
- Preserved exact prices above JavaScript's safe-integer limit when formatting lowest asks and calculating suggested sell prices.

### Removed

- Removed Sentry, PostgreSQL support, file-based debug output, obsolete documentation, the helper scripts directory, the public asset directory, generated test results, redundant map CSS, and other unused project files.

### Verification

- Formatting, TypeScript validation, zero-warning lint, 143 Vitest tests, production build, runtime smoke checks, dependency audit, and 22 Chromium browser tests pass.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.0.4...v1.0.5)

## [1.0.4] - 2026-09-08

### Changed

- Replaced Upstash REST storage with a shared Redis TCP client for sessions, rate limits, guild logos, population history, and import tracking.
- Added `REDIS_URL` configuration with custom allocation ports, optional TLS, bounded connections, and Pterodactyl deployment instructions.
- Preserved existing storage key formats, JSON encoding, session lifetimes, atomic rate limits, and import reservations.

### Fixed

- Restored login, callback, and logout rewrites by removing a configuration export that overwrote the main Next.js settings.
- Fixed homepage failures with a session cookie by awaiting the session-store module import.
- Clear stale session cookies when their login record is missing, while preserving cookies during storage outages.
- Added a static 404 page to resolve the custom error-page optimization warning.

### Upgrade

- Replace `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` with `REDIS_URL` before restarting production. Use `redis://default:PASSWORD@HOST:PORT/0` for the selected non-TLS Pterodactyl deployment.
- This deployment starts with an empty Redis database; Upstash data is neither copied nor deleted. Users must sign in again, and logos, population history, and import tracking start empty.

### Verification

- Added Redis protocol transport, connection recovery, environment validation, stale-cookie, and authenticated homepage regression checks.
- Production build and smoke checks, typecheck, zero-warning lint, formatting, 120 unit tests, 22 Chromium browser tests, and dependency audit pass.
- Live self-hosted Redis connectivity and deployment remain separate from the automated fixture checks.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.0.3...v1.0.4)

## [1.0.3] - 2026-09-08

### Added

- Guild discovery, guild logos, member data, and character-to-guild presentation in the portal.
- A refreshed landing page with community links, Discord widget, live status summary, and authenticated actions.
- Shared inventory presentation and expanded portal overview, dossier, market, and population components.

### Changed

- Reorganized API, architecture, and unit tests into focused directories while preserving the existing route contracts.
- Improved portal layout, responsive styling, market and population presentation, and session handling.
- Allowed Discord avatar image sources and cleaned production startup console output.

### Verification

- TypeScript validation, zero-warning lint, 109 Vitest tests, production build/smoke checks, dependency audit, and diff validation pass.
- This pull request prepares the source for the v1.0.3 release; deployment and production restart remain separate operations.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.0.2...v1.0.3)

## [1.0.2] - 2026-09-07

### Added

- Original Crimson Skies portal redesign with a responsive shared shell, character dossier, searchable storage, guild and holdings views.
- Embedded Hagga Basin and Deep Desert maps, clear marker checkboxes, possible/live spice badges and owned-resource details.
- Redis-backed population history, a 24-hour graph, Landsraad crests, Discord avatars and an index of 1,514 item images.
- Private blueprint import beneath My bases with JSON validation, verified character targeting and operation deduplication.
- Thirty-second client/server read caches, session-scoped browser restoration and a protected session bootstrap endpoint.
- Sanitized opt-in API snapshots, isolated provider transport, runtime environment validation and bounded Redis requests.

### Changed

- Preserve clean /portal navigation with back/forward and reload support; redirect legacy /map links into the portal.
- Keep global market metrics available with personal-listing filters, and display seller price ladders and safe partial failures.
- Consolidate feature, infrastructure and system ownership while preserving Pages Router and runPagesApiHandler protections.
- Display the package version automatically in the footer and isolate browser CI from deployment credentials.

### Removed

- RabbitMQ live-intel collection and obsolete diagnostic code. Community base gallery and separate Solido tabs remain deferred.

### Verification and release limits

- Typecheck, zero-warning lint, formatting, 102 unit tests, production build/smoke and 22 Chromium browser tests verified during release preparation.
- Live local checks covered Discord sign-in, session persistence across restart, real telemetry, markets, maps, storage, owned blueprint export and population history.
- Real in-game blueprint delivery was not performed. Continuous 24-hour collection, full 12-hour elapsed session testing and non-Chromium browser coverage remain outside this validation.
- Publishing this source release does not deploy the website. Configure the target environment and keep API_DEBUG_ENABLED=false for normal operation.

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.0.1...v1.0.2)

## [1.0.1] - 2026-09-07

### Added

- Retry support for temporary player-profile failures and market loading errors.
- Debounced market search, pagination, request cancellation, and session-expiry messaging.
- Production runtime smoke checks in CI, plus expanded API regression, architecture, environment, session-lifetime, server-guard, and market-format tests.
- Structured authentication logs for missing session cookies, unavailable session records, and established sessions.

### Changed

- Extracted feature handlers and page components into modules, centralized Pages API handling, and separated Dune and Discord transport logic.
- Limited OAuth session cookies and Redis session records to 12 hours, with remaining-lifetime TTL handling and development sessions retained across reloads.
- Improved responsive portal spacing, full-width layouts, character headers, and landing-page controls.
- Switched browser Sentry reporting from the `/monitoring` rewrite to direct transport, with the Sentry origin allowed by CSP and initialization driven by validated configuration.
- Market listings remain available when totals or buyback configuration fail, with warnings explaining partial results.

### Fixed

- Replaced the React-only `server-only` marker with a Node-compatible guard that rejects browser imports of server modules.
- Preserved large integer market quantities and prices when formatting, and supported multiple buyback configuration shapes.
- Corrected logout redirects to use the configured application URL or request origin, and report session-revocation failures instead of silently succeeding.
- Corrected the trailing newline in the previous changelog.

### Security and API compatibility

- Logout now requires `POST`; `GET` returns 405 to prevent prefetch-triggered logout. Cross-site and mismatched-origin logout requests are rejected, and successful logout revokes the session before a 303 redirect.
- Disabled CDN caching for authentication-related API responses and strengthened protected cookie and session handling.
- Validated market search and page parameters. The market response now includes partial-result `warnings` and no longer includes the unused `config` field.

### Verification

- TypeScript validation and production build pass.
- ESLint passes with 8 existing warnings and no errors.
- Vitest passes: 47 tests across 10 files.
- Production smoke checks pass for the portal, 9 API modules, 100 unauthorized requests, authenticated telemetry and market requests, safe logout prefetch, and POST session revocation, without import or listener warnings.

### Commits since v1.0.0

- [fdc2692](https://github.com/RealXKenny/Arrakis-Control-Dashboard/commit/fdc26924153f1a78681d38ab871b7581b31b5dae) Fix changelog newline
- [acdf298](https://github.com/RealXKenny/Arrakis-Control-Dashboard/commit/acdf2982ead8096af6996681208ec4b53bd264ce) Modularize server routes and enforce boundaries
- [85ed977](https://github.com/RealXKenny/Arrakis-Control-Dashboard/commit/85ed977e64697af91bfc1053001952fb7e68d87f) Twelve-hour sessions and portal retry flow
- [a84bbaa](https://github.com/RealXKenny/Arrakis-Control-Dashboard/commit/a84bbaa707899c0fbafe3ec719d49aa405b8d34d) UI layout tweaks and version bump
- [8963527](https://github.com/RealXKenny/Arrakis-Control-Dashboard/commit/8963527629e506bb91ff6dbff563fdbe5815351b) Replace server-only with assert-server guard
- [40f191f](https://github.com/RealXKenny/Arrakis-Control-Dashboard/commit/40f191fd58feafb20c183dc00acdf03183735d85) Direct Sentry transport and auth caching
- [5312617](https://github.com/RealXKenny/Arrakis-Control-Dashboard/commit/5312617705e693baaf6c17aab7c9ead1b5bd9e17) Harden logout flow and improve market board

[Full comparison](https://github.com/RealXKenny/Arrakis-Control-Dashboard/compare/v1.0.0...v1.0.1)

## [1.0.0] - 2026-09-06

### Added

- Next.js Pages Router dashboard for Dune: Awakening Console operations.
- Discord OAuth authentication and verified guild-role authorization.
- Player telemetry, bases, vehicles, inventory, market, and map views.
- Base export support through protected API routes.
- Configurable development and production bind settings through `DASHBOARD_HOSTNAME` and `DASHBOARD_PORT`.
- Sentry monitoring for client, server, and edge runtimes with source-map upload support.
- Security middleware with request IDs, CSP, referrer policy, permissions policy, HSTS, and content-type protection.
- Redis-backed sessions and production rate limiting through Upstash Redis.
- Local development fallback for rate limits and sessions when production storage is not configured.
- Structured, redacted, colorized dashboard logging with level filtering, scopes, timestamps, fatal errors, and startup branding.
- Compact route-aware API messages such as `Grabbed data for server status`.
- Root document metadata for the dashboard title, description, viewport, language, and security tags.

### Changed

- API boundaries now enforce methods, rate limits, request IDs, safe error responses, and secret redaction consistently.
- Sentry configuration uses the non-deprecated `@sentry/nextjs/config` wrapper import.
- Duplicate Sentry server initialization was removed to prevent `ServerResponse` listener warnings.
- Startup output clears the console, displays the Arrakis Control banner, and reports when the dashboard is loaded.

### Security

- OAuth sessions store opaque identifiers instead of access tokens in cookies.
- Sensitive values are redacted from logs and Sentry context.
- External provider requests use bounded timeouts and controlled retry behavior.
- Production rate limits fail closed when shared Redis storage is unavailable.

### Verification

- TypeScript validation passes.
- ESLint passes with the repository's configured rules.
- Vitest suite passes with 9 tests.
- Production build is required before deployment; configure all values in `.env` first.
