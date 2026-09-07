# Production Operations

## Configuration

Copy `.env.example` to `.env` and provide the server-only Dune, Discord, and Upstash Redis values. `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are required in production. Discord also requires `DISCORD_GUILD_ID`, `DISCORD_REDIRECT_URI`, and `DISCORD_APP_URL`; `APP_URL` and `VERIFIED_MEMBER_ROLE_ID` should be set for stable redirects and role authorization. `CONSOLE_PASSWORD`, `ADAPTER_TOKEN`, `DISCORD_CLIENT_SECRET`, and the Redis token must never use a `NEXT_PUBLIC_` prefix. Sentry is optional; when `SENTRY_DSN` is absent, the application continues without reporting.

## Request handling

Pages API routes are wrapped by `runPagesApiHandler`. It assigns an `X-Request-ID`, applies method checks and rate limits, writes compact route-aware logs with secret redaction, and returns safe error envelopes. Unexpected errors are reported to Sentry when configured.

Rate limits use Upstash Redis fixed-window counters, hashed keys, and fail closed with HTTP 503 when Redis is unavailable in production. Development and tests use a bounded local fallback only when `NODE_ENV` is not `production` and Redis credentials are absent.

OAuth sessions use Redis JSON records with a 24-hour TTL. Cookies contain only a random session identifier; OAuth access tokens are never persisted. Logout deletes the Redis record and expires the cookie.

## Monitoring

Set `SENTRY_DSN` for server and Edge reporting and `NEXT_PUBLIC_SENTRY_DSN` for browser reporting. Browser configuration does not fall back to server environment values. Startup is consolidated in `src/instrumentation.ts`, which initializes monitoring and warms the Dune client on Node.js. No market response snapshots are written to disk.

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
