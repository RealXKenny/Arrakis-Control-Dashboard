# Changelog

All notable changes to Arrakis Control Dashboard are documented here.

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
