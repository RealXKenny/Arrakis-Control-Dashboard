<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Arrakis Control Dashboard

Use this map before searching. Keep it current when structure or core contracts change.

## Runtime

- Stack: Node.js 22+, Next.js 16 Pages Router, React 19, TypeScript, npm, Redis, Vitest, and Playwright.
- Dev: `npm run dev` at `http://127.0.0.1:2008`. Production: `npm run build`, then `npm start`.
- Standard checks: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`.
- Extra checks: `npm run test:production` for runtime/API changes; `npm run test:browser` for UI behavior.
- `LOG_LEVEL=DEBUG` writes redacted metadata to the colored console only. There are no log files or Sentry.

## Map

- `src/pages/`: thin Pages Router pages/API entry points; there is no App Router.
- `src/modules/<feature>/`: UI, hooks, normalization, utilities, and server handlers for `auth`, `bases`, `guilds`, `home`, `map`, `player`, and `portal`.
- `src/infrastructure/`: Dune Console/adapter and Discord clients, API boundary, cookies, and API cache. Start with `dune.ts`, `dunedocker/transport.ts`, or `pages-api.ts`.
- `src/lib/`: server guards, Redis, sessions, rate limits, logging, errors, timeouts, and shared caches.
- `src/config/env.ts`: authoritative server environment schema and production validation.
- `src/instrumentation.ts`: runtime validation, Console warmup, startup log, and population recorder.
- `src/assets/`: favicon and application images. It is large; do not enumerate it unless necessary.
- `tests/`: API, architecture, unit, browser, helpers, and `smoke-production.mjs`.
- Root runtime behavior: `middleware.ts` and `next.config.ts`.

## Contracts

- API entry points delegate to feature handlers through `runPagesApiHandler`. The read-only binary route `src/pages/api/assets/[...path].ts` is the only intentional exception.
- Browser code must not transitively import infrastructure, `src/config/env.ts`, `server` directories, or server-only Redis/session/rate-limit/logger modules. Architecture tests enforce this.
- Normalize external payloads from `unknown`; never expose raw errors, credentials, admin payloads, or unbounded data. Keep unsafe-size numbers as decimal strings until display.
- Redis is the only persistent store and backs production sessions/rate limits. Do not add PostgreSQL or another database.
- Dune Console uses `Authorization: Bearer <CONSOLE_API_KEY>`. Do not restore password login, session cookies, CSRF, or automatic reauthentication.
- `ADAPTER_TOKEN` is distinct from `CONSOLE_API_KEY`; never interchange or merge these credentials.
- `/items/*`, `/maps/*`, and `/favicon.ico` rewrite to the hardened asset route backed by `src/assets/`; do not recreate `public/`.
- Preserve request IDs, method checks, private/no-store headers, POST-only logout, ownership checks, bounded retries/timeouts, and recursive secret redaction. Operational provider errors omit stacks.

## Environment

- `.env` is ignored and secret; `.env.example` is the only committed template. Never print values or create `NEXT_PUBLIC_` secrets.
- `APP_URL` is the canonical public origin, and `DISCORD_REDIRECT_URI` must share that origin in production.
- Empty environment values normalize to absent values. Add or change variables in `src/config/env.ts`, `.env.example`, tests, and README together.
- Builds work without deployment secrets; production runtime does not.

## Change discipline

- Before changing Next.js behavior, read the local guide required above. Never edit the managed block.
- Prefer feature-module changes and keep page entry points thin. Add the smallest focused regression test.
- For runtime, routing, environment, or infrastructure changes, run standard checks plus build and production smoke.
- Never commit generated `.next/`, `coverage/`, `test-results/`, `playwright-report/`, or `tsconfig.tsbuildinfo` output.
- Do not recreate removed `docs/`, `scripts/`, `public/`, debug-output folders, Sentry files, PostgreSQL configuration, `CHANGELOG.md`, or `CLAUDE.md`.
- Preserve unrelated user changes. Do not perform broad cleanup outside the requested scope.
