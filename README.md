# Arrakis Control Dashboard

Arrakis Control is a Next.js dashboard for authorized Dune server operations. It provides Discord OAuth login, player telemetry, base and vehicle data, market information, map data, and base export functionality.

The application uses the Next.js Pages Router and keeps external service credentials and authorization decisions on the server.

## Requirements

- Node.js 22 or newer
- npm
- A Dune Console instance and adapter token
- A Discord application configured for OAuth2
- PostgreSQL or a self-hosted Redis server for production deployments

## Quick Start

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The development server listens on `http://127.0.0.1:2008`.

Set `DASHBOARD_HOSTNAME` and `DASHBOARD_PORT` in `.env` to bind the dashboard to a different interface and port. You can also override them for a single run with Next.js options, for example `npm run dev -- --hostname 0.0.0.0 --port 3000`.

Fill in `.env` before using authentication or server-backed features. Never commit `.env` or place server secrets in variables beginning with `NEXT_PUBLIC_`.

## Environment

Required production variables include:

- `CONSOLE_URL`, a full-access `CONSOLE_API_KEY`, and `ADAPTER_TOKEN` for Dune Console access.
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_REDIRECT_URI`, and `DISCORD_APP_URL` for Discord OAuth.
- `APP_URL` and `VERIFIED_MEMBER_ROLE_ID` for redirects and role authorization.
- `STORAGE_BACKEND=redis` with `REDIS_URL`, or `STORAGE_BACKEND=postgres` with `DATABASE_URL`, for shared state.

Branding, community links, map labels, theme colors, feature switches, polling, retention, quotas, and upload limits are configured in `.env`. Browser-safe values are served through `/api/config`; secrets are never included. PostgreSQL deployments must run `npm run db:migrate` before the first start.

The atlas discovers all named sietches and Deep Desert partitions from the Console. Navigation and selectors use returned display names, while marker and world-reading requests retain both map and partition IDs. `SITE_DEFAULT_DESTINATION` may select one discovered destination key.

Sentry variables are optional. Configure `SENTRY_DSN` for runtime monitoring and `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` for production source-map upload. See [.env.example](.env.example) for the complete template.

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

CI runs typecheck, lint, tests, and the production build for pushes to `main` and pull requests.

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
- `src/infrastructure/` contains provider clients, API boundaries, and Redis/PostgreSQL storage adapters.
- `src/lib/` contains shared logging, errors, Redis, rate limiting, and session storage.
- `src/config/env.ts` validates server environment configuration.
- `middleware.ts` adds request correlation and security headers.
- `tests/` contains focused unit and API-boundary tests.

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for the full repository map and [docs/PRODUCTION.md](docs/PRODUCTION.md) for deployment operations.

## Security and Reliability

- API routes receive request IDs, method checks, structured logging, safe error responses, and shared rate limiting.
- Production rate limits use the selected shared backend and fail closed if storage is unavailable.
- OAuth sessions use expiring shared-storage records; cookies contain only random opaque session IDs.
- OAuth access tokens are not persisted.
- Logs and Sentry context redact passwords, tokens, cookies, authorization headers, and session values.
- Security headers are applied by middleware, including CSP, frame protection, referrer policy, and HSTS in production.
- External requests use bounded timeouts and safe retry behavior where applicable.

## Production Deployment

1. Provision PostgreSQL or Redis. For PostgreSQL, configure `DATABASE_URL` and run `npm run db:migrate`.
2. Configure Discord OAuth redirect URI as `<APP_URL>/auth/callback`.
3. Set all required server-only variables from `.env.example` in the deployment platform.
4. Run the verification commands locally or in CI:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

5. Start with `npm start` and monitor application logs and Sentry.

Do not deploy with placeholder values, disabled HTTPS, or missing shared-storage credentials. PostgreSQL or Redis is required in production so sessions and rate limits work across instances and survive restarts.

## Operational Notes

The dashboard expects the Dune Console and Discord provider to be reachable at runtime. Provider failures are logged with correlation IDs and returned as safe errors where possible. The local development fallback for Redis-backed state is intentionally not suitable for production.
