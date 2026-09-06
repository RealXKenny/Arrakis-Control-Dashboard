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
│   ├── infrastructure/      Dune client, cookies, API boundary helpers
│   ├── lib/                 Logger, errors, Redis, rate limits, sessions
│   ├── modules/
│   │   ├── map/             Map UI, hooks, normalization, and server access
│   │   ├── player/          Player-specific server helpers
│   │   └── portal/          Portal UI, data hooks, and presentation utilities
│   ├── pages/               Next.js pages and API routes
│   └── styles/              Global CSS
├── tests/                   Vitest unit and API-boundary tests
├── instrumentation.ts       Server startup and Sentry initialization
├── middleware.ts            Request IDs and security headers
├── sentry.*.config.ts       Client, server, and Edge monitoring setup
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
  -> infrastructure/dune.ts or external provider
```

`runPagesApiHandler` supplies request IDs, method checks, shared rate limits, safe error envelopes, and request logging. API routes should keep domain-specific authorization and response shaping local to the feature.

## State Boundaries

- Redis stores rate-limit counters and expiring OAuth sessions in production.
- Session cookies contain only random opaque identifiers.
- Dune credentials, Discord client secrets, adapter tokens, Redis tokens, and Sentry upload credentials are server-only.
- Development-only in-memory fallbacks are available when `NODE_ENV` is not `production` and shared Redis credentials are absent.

## Adding a Feature

1. Put reusable UI in `src/components` and feature UI in the appropriate `src/modules` directory.
2. Put external service calls in `src/infrastructure` or a feature server module.
3. Add API routes under `src/pages/api` and wrap them with `runPagesApiHandler`.
4. Validate server configuration through `src/config/env.ts`.
5. Add focused tests under `tests/` for authorization, failure behavior, and important transformations.
