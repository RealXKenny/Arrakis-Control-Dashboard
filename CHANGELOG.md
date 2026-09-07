# Changelog

All notable changes to Arrakis Control Dashboard are documented here.

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