# Project Structure

Arrakis Control is a Next.js Pages Router application. Server-only integrations and security controls stay outside client components; feature UI and domain transformations remain grouped by module.

```text
.
├── .github/workflows/       CI verification
├── docs/                    Architecture and production operations
├── public/                  Static backgrounds, icons, items, and maps
├── src/
│   ├── components/          Shared UI components
│   ├── config/              Validated server configuration
│   ├── infrastructure/      Dune and Discord clients, cookies, API boundary helpers
│   ├── lib/                 Logger, errors, Redis, rate limits, sessions
│   ├── modules/
│   │   ├── auth/            OAuth login, callback, and logout server handlers
│   │   ├── home/            Landing UI, telemetry hook, and server status handler
│   │   ├── guilds/          Authenticated guild and member API handlers
│   │   ├── map/             Map UI, hooks, normalization, and server access
│   │   ├── player/          Player server handler and normalization helpers
│   │   └── portal/          Portal UI, hooks, utilities, market access, base export
│   ├── pages/               Thin page exports and wrapped API entry points
│   ├── instrumentation.ts  Server startup, Dune warmup, and Sentry initialization
│   ├── instrumentation-client.ts  Browser monitoring using public configuration
│   └── styles/              Global CSS
├── tests/
│   ├── api/                API boundary, hardening, and route regression tests
│   ├── architecture/      Import-boundary and structural checks
│   ├── browser/            Playwright browser tests
│   ├── helpers/            Shared test fixtures
│   └── unit/               Focused transformation and service tests
├── middleware.ts            Request IDs and security headers
├── sentry.*.config.ts       Server and Edge monitoring setup
├── next.config.ts           Next.js and Sentry build configuration
├── eslint.config.mjs        ESLint flat configuration
├── vitest.config.mjs        Vitest configuration
└── .env.example             Environment variable template
```

## Request Flow

```text
Browser
  -> middleware.ts
  -> src/pages/api/**
  -> runPagesApiHandler
  -> authentication/session lookup
  -> feature route
  -> infrastructure/dune.ts or infrastructure/discord.ts
```

`runPagesApiHandler` supplies request IDs, method checks, shared rate limits, safe error envelopes, and request logging. API routes should keep domain-specific authorization and response shaping local to the feature.

Each API entry point imports its feature's handler (GET for reads, POST for logout) and explicitly calls `runPagesApiHandler`. The boundary also normalizes returned failure responses and catches rate-limit failures. Successful JSON, redirects, and blueprint attachments retain their existing shapes. Feature handlers must supply safe public error messages, never raw upstream errors.

Portal owns its navigation, market board, market configuration, and base-export workflow. Shared UI belongs in `src/components/` only when it is feature-agnostic; no placeholder shared component or barrel is needed. Module-local imports remain relative, and tests import routes or focused utilities directly.

## State Boundaries

- Redis stores rate-limit counters and expiring OAuth sessions in production.
- Session cookies contain only random opaque identifiers.
- Dune credentials, Discord client secrets, adapter tokens, Redis tokens, and Sentry upload credentials are server-only.
- Server configuration, provider clients, cookies, and server storage import `src/lib/assert-server.ts`, a browser-rejecting guard compatible with ordinary Node execution in Pages Router and instrumentation. Browser code must never import these modules, including transitively through a barrel. Do not use the React Server Component `server-only` package here: its default Node export throws when externalized by the server runtime.
- Only `NEXT_PUBLIC_SENTRY_DSN` is read by browser monitoring. Server and Edge monitoring read the validated `SENTRY_DSN` setting. Empty optional environment settings are treated as absent.
- Development-only in-memory fallbacks are available when `NODE_ENV` is not `production` and shared Redis credentials are absent.

## Adding a Feature

1. Put reusable UI in `src/components` and feature UI in the appropriate `src/modules` directory.
2. Put provider transport in `src/infrastructure`; keep feature access, authorization, and transformations in that feature's `server/` directory.
3. Add API routes under `src/pages/api` and wrap them with `runPagesApiHandler`.
4. Validate server configuration through `src/config/env.ts`.
5. Add focused tests under `tests/` for authorization, failure behavior, and important transformations.

## Verification

`npm run typecheck` performs TypeScript checking with unused-local and unused-parameter checks enabled. `npm test` covers the API boundary, all route method checks, protected-route session checks, OAuth cookies, blueprint downloads, safe provider failures, environment validation, and portal currency shapes. Architecture tests walk browser imports transitively and enforce API wrapping. Guard tests exercise both Node and browser behavior without mocking the guard.

Generated output such as `.next/`, `coverage/`, `debug/`, `test-results/`, and `tsconfig.tsbuildinfo` is intentionally kept outside the source tree and ignored by Git. It can be removed and regenerated when a clean workspace is needed.

After `npm run build`, run `npm run test:production`. It starts the built Next.js server with isolated provider configuration and a local Redis transport fixture, exercises every API module and 100 protected requests, and rejects import failures or listener warnings. No live credentials or accounts are used.

The rebuilt portal uses a feature-agnostic DashboardShell in src/components, with feature navigation in the portal module. See [Portal rebuild](PORTAL_REBUILD.md) for the current design, browser checks, and remaining production acceptance criteria.
