# Changelog

All notable changes to Arrakis Control Dashboard are documented here.

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
