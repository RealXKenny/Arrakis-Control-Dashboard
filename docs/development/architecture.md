# Architecture

## Stack

Node.js 22+, Next.js 16 App Router ("V2" UI) with a remaining Pages Router `src/pages/api` layer, React 19, TypeScript, Tailwind CSS v4,
Auth.js v5 (beta), `ioredis`, Zod, Vitest, Playwright. Redis is the only persistent store (no PostgreSQL). Next.js 16 differs from
older releases: read the local guide in `node_modules/next/dist/docs/` before changing framework behaviour.

## Request flow

```mermaid
flowchart TD
    R[Request] --> P[src/proxy.ts: nonce CSP, security headers, request ID]
    P --> A{App Router page / route handler?}
    A -->|page| S[requireSession in the page]
    A -->|/api/v2| H[route() in server/http.ts: same-origin, session, bounded body, no-store JSON]
    A -->|/api legacy| L[runPagesApiHandler: method check, capacity, rate limit, read cache]
    H --> F[features/*/server]
    L --> F
    S --> F
    F --> C[Dune Console client]
    F --> D[(Redis)]
```

`src/proxy.ts` (Next.js 16's replacement for middleware) issues a per-request `'nonce-…'` CSP, so pages stay dynamically rendered
(`APP_URL` is a runtime variable). The CSP allows no third-party script, connect or image origin except Discord's CDN for avatars.

## Authentication

`features/auth/server/config.ts` (Auth.js) issues the cookie; `session-store.ts` is raw Redis persistence; `session.ts` is the freshness
orchestration every reader uses (30-minute Discord re-verification, 6-hour grace, cross-instance refresh-token lock in `reverify.ts`).
Keep store and orchestration acyclic. Admin authority: `features/admin/server/access.ts` and `risk.ts`. See [authentication](../configuration/authentication.md).

## Console access

`server/integrations/dune.ts` wraps `dunedocker/transport.ts` (timeouts, read retries, safe errors). Features normalize responses from
`unknown`. The admin catalog (`features/admin/catalog.json`) is an allowlist executed by `features/admin/server/execute.ts`.

## Redis

`lib/redis/client.ts` (command surface incl. `eval`), `pool.ts` (snapshot/data provider), `connection.ts` (URL parsing, hash slots),
`keys.ts` (the key schema and hash tags), `data-provider.ts` (cached Console snapshots). Multi-key Lua scripts share a hash tag so they run on a
Cluster; the client rejects cross-slot scripts. Security primitives: `lib/security/rate-limit.ts`, `audit.ts`, `api-capacity.ts`.

## Boundaries enforced by architecture tests

Browser code must not (transitively) import `src/config/env.ts`, any `server/` directory or the server-only Redis/session/rate-limit/logger
modules. API entry points delegate to feature handlers through `runPagesApiHandler`, except the read-only asset route. Dependency graph must stay acyclic;
root files are allowlisted. See `tests/architecture/architecture.test.ts`.

## Related

[Project structure](project-structure.md) · [File organization](../architecture/file-organization.md) · [Security overview](../security/security-overview.md)
