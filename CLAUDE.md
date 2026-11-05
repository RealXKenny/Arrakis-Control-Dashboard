# Arrakis Control Dashboard

Guidance for Claude Code. Next.js 16 here has breaking changes from older versions: read the relevant guide in `node_modules/next/dist/docs/` before changing Next.js behavior, and heed deprecation notices. Never edit the managed block in `AGENTS.md`; `AGENTS.md` also holds the detailed module map.

## Stack and commands

- Node.js 22+, Next.js 16 Pages Router, React 19, TypeScript, npm, Redis, Vitest, Playwright.
- Dev: `npm run dev` (default `http://127.0.0.1:2008`; `SERVER_HOSTNAME`/`SERVER_PORT` in `.env`). Production: `npm run build`, then `npm start`.
- Standard checks: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`.
- Also run `npm run test:production` for runtime/API changes and `npm run test:browser` for UI behavior.
- Runtime, routing, environment, or infrastructure changes: standard checks plus build and production smoke.

## Layout

- `src/pages/`: thin Pages Router pages and API entry points. `/` is the public landing page; `/portal` is the signed-in workspace.
- `src/modules/<feature>/`: UI, hooks, normalization, utilities and server handlers per feature (`auth`, `bases`, `changelog`, `guilds`, `home`, `map`, `player`, `portal`, plus `marketplace`, `sharing`, `theme`, `bot`, `admin`). CSS modules live in each feature's `styles/` folder.
- `src/infrastructure/`: Dune Console/adapter and Discord clients, API boundary, cookies, API cache.
- `src/lib/`: `redis/`, `security/`, `cache/`, `http/`, and root helpers. `env.ts` is the canonical environment schema. `lib/redis/` and `lib/security/` are server-only.
- `src/config/`, `src/instrumentation.ts`, `src/proxy.ts`, `next.config.ts`: server config, startup, and middleware (CSP with per-request nonce; keep pages dynamically rendered).
- `src/assets/` is large; do not enumerate it. `tests/` holds api, architecture, unit, browser, helpers and the production smoke script.

## Contracts

- API entry points go through `runPagesApiHandler`. The only exception is the read-only binary route `src/pages/api/assets/[...path].ts`.
- Browser code must not import infrastructure, `src/config/env.ts`, `server` directories, or server-only Redis/session/rate-limit/logger modules. Architecture tests enforce this.
- Normalize external payloads from `unknown`. Never expose raw errors, credentials, admin payloads, or unbounded data. Keep unsafe-size numbers as decimal strings until display.
- Redis is the only persistent store. Do not add PostgreSQL or another database.
- Auth: Discord OAuth by default, or Clerk. Both end in `establishDashboardSession`, which re-verifies the guild role and keys the session to the Discord user ID. Never trust a Clerk user ID for ownership or admin checks.
- Dune Console uses `Authorization: Bearer <CONSOLE_API_KEY>`. Do not restore password login, session cookies, CSRF, or automatic reauthentication. `ADAPTER_TOKEN` and `CONSOLE_API_KEY` are distinct; never merge them.
- Preserve request-ID sanitizing, method checks, no-store and security headers, same-origin mutation checks, POST-only logout, ownership checks, bounded provider calls, host-prefixed production cookies, and recursive secret redaction.
- Do not recreate `public/`; `/items/*`, `/maps/*`, and `/favicon.ico` rewrite to the asset route backed by `src/assets/`.
- Animations: never animate an ancestor of the map or full-screen base preview layers, and disable every animation under `prefers-reduced-motion`.

## Environment

- `.env` is ignored and secret; `.env.example` is the only committed template. Never print values or create `NEXT_PUBLIC_` secrets.
- `APP_URL` is the canonical public origin; the Discord callback is `<APP_URL>/auth/callback`. Do not add a separate redirect URI variable.
- Add or change variables in `src/lib/env.ts`, `.env.example`, tests, and README together.

## Conventions

- Prefer feature-module changes, keep page entry points thin, and add the smallest focused regression test.
- Keep `Dev note:` easter eggs inside executable code near real logic, never in file headers or non-code files. Use them selectively, mixing corny dad jokes with developer and Dune humor.
- Releases: bump `package.json` and `package-lock.json` versions together and add a matching `## [X.Y.Z] - YYYY-MM-DD` section to `CHANGELOG.md`.
- Never commit `.next/`, `coverage/`, `test-results/`, `playwright-report/`, or `tsconfig.tsbuildinfo`.
- Preserve unrelated user changes and avoid broad cleanup outside the requested scope.
- Keep this file and `AGENTS.md` consistent when structure or core contracts change.
