# Arrakis Control Dashboard

Guidance for Claude Code. Next.js 16 here has breaking changes from older versions: read the relevant guide in `node_modules/next/dist/docs/` before changing Next.js behavior, and heed deprecation notices. Never edit the managed block in `AGENTS.md`; `AGENTS.md` also holds the detailed module map.

## Stack and commands

- Node.js 22+, Next.js 16 App Router (V2 "Modern Dune" UI) plus a remaining Pages Router `src/pages/api` layer, React 19, TypeScript, Tailwind CSS v4, npm, Redis (ioredis, standalone or Cluster), Vitest, Playwright.
- Dev: `npm run dev` (default `http://127.0.0.1:2008`; `SERVER_HOSTNAME`/`SERVER_PORT` in `.env`). Production: `npm run build`, then `npm start`.
- Standard checks: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`.
- Also run `npm run test:production` for runtime/API changes and `npm run test:browser` for UI behavior.
- Runtime, routing, environment, or infrastructure changes: standard checks plus build and production smoke.

## Layout

- `src/app/`: App Router pages. `/` is the public landing page; the signed-in workspace is `(workspace)/` (`portal`, `character`, `holdings`, `storage`, `vehicles`, `market`, `bases`, `guilds`, `guild`, `map`, `admin`). Every page calls `requireSession()` itself. Route handlers for V2 live in `src/app/api/v2/**` (use `src/server/http.ts`); `src/pages/api/**` is the legacy API layer.
- `src/features/<feature>/` (pure, browser-safe Zod schemas, normalisers, view models) and `src/server/` (server-only V2 loaders and stores) are the V2 homes. `src/modules/<feature>/` is legacy feature code (`auth`, `bases`, `changelog`, `guilds`, `map`, `player`, `portal`, `marketplace`, `bot`, `admin`) that V2 pages still reuse; move code into `features`/`server` as you touch it. Styling is Tailwind with `tailwind.config.ts`; `src/app/tokens.css` keeps the `--theme-*` variables used by the map and 3D base-preview CSS modules.
- `src/infrastructure/`: Dune Console/adapter and Discord clients, API boundary, cookies, API cache.
- `src/lib/`: `redis/`, `security/`, `cache/`, `http/`, and root helpers. `env.ts` is the canonical environment schema. `lib/redis/` and `lib/security/` are server-only.
- `src/config/`, `src/instrumentation.ts`, `src/proxy.ts`, `next.config.ts`: server config, startup, and middleware (CSP with per-request nonce; keep pages dynamically rendered).
- `src/assets/` is large; do not enumerate it. `tests/` holds api, architecture, unit, browser, helpers and the production smoke script.

## Contracts

- Legacy API entry points go through `runPagesApiHandler`; the only exception is the read-only binary route `src/pages/api/assets/[...path].ts`. V2 route handlers use `route()` from `src/server/http.ts`: same-origin check on mutations, `requireApiSession`, bounded bodies (`readBoundedBody`), no-store JSON, safe errors.
- Browser code must not import infrastructure, `src/config/env.ts`, `server` directories, or server-only Redis/session/rate-limit/logger modules. Architecture tests enforce this.
- Normalize external payloads from `unknown`. Never expose raw errors, credentials, admin payloads, or unbounded data. Keep unsafe-size numbers as decimal strings until display.
- Redis is the only persistent store (ioredis; `REDIS_CLUSTER_NODES` switches to Cluster). Every multi-key Lua script must use keys from `src/lib/redis/keys.ts` or share a `{hash tag}`; `npm run redis:rekey` migrates legacy key names. Do not add PostgreSQL or another database.
- Auth: Auth.js (`next-auth` v5) in `src/server/auth/config.ts`, mounted at `/api/auth/[...nextauth]`. Providers are Discord OAuth and email/password (Credentials; accounts exist only after a Discord signup sets a password on the Discord-verified email). Both paths re-verify the guild role against Discord (password logins use the stored, sealed refresh token) and key the session to the Discord user ID. Auth.js stores its session in the Redis session store (`lib/security/session-store.ts`, 30-day lifetime). Every `getSession` re-confirms guild membership and the required role through the sealed refresh token when the last check is older than 30 minutes (`server/auth/reverify.ts`): removal ends the session, an unreachable Discord is tolerated for 6 hours after the last confirmation, and a session without a `verifiedAt` stamp gets no grace and names its cookie `dashboard_session` (`__Host-` in production), so legacy guards keep reading the same record. Passwords are scrypt-hashed; keep the email source Discord-verified, and never trust an email from a request body.
- Dune Console uses `Authorization: Bearer <CONSOLE_API_KEY>`. Do not restore Console password login, Console session cookies, CSRF, or automatic reauthentication. `ADAPTER_TOKEN` and `CONSOLE_API_KEY` are distinct; never merge them.
- Preserve request-ID sanitizing, method checks, no-store and security headers, same-origin mutation checks, POST-only logout, ownership checks, bounded provider calls, host-prefixed production cookies, and recursive secret redaction.
- Do not recreate `public/`; `/items/*`, `/maps/*`, and `/favicon.ico` rewrite to the asset route backed by `src/assets/`.
- Animations: never animate an ancestor of the map or full-screen base preview layers, and disable every animation under `prefers-reduced-motion`.

## Environment

- `.env` is ignored and secret; `.env.example` is the only committed template. Never print values or create `NEXT_PUBLIC_` secrets.
- `APP_URL` is the canonical public origin; the Discord callback is `<APP_URL>/api/auth/callback/discord`. `AUTH_SECRET` (32+ chars) signs Auth.js state and seals stored refresh tokens. Do not add a separate redirect URI variable.
- Add or change variables in `src/lib/env.ts`, `.env.example`, tests, and README together.

## Conventions

- Prefer feature-module changes, keep page entry points thin, and add the smallest focused regression test.
- Keep `Dev note:` easter eggs inside executable code near real logic, never in file headers or non-code files. Use them selectively, mixing corny dad jokes with developer and Dune humor.
- Releases: bump `package.json` and `package-lock.json` versions together and add a matching `## [X.Y.Z] - YYYY-MM-DD` section to `CHANGELOG.md`.
- Never commit `.next/`, `coverage/`, `test-results/`, `playwright-report/`, or `tsconfig.tsbuildinfo`.
- Preserve unrelated user changes and avoid broad cleanup outside the requested scope.
- Keep this file and `AGENTS.md` consistent when structure or core contracts change.
