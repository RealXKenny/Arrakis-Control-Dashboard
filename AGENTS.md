<!-- BEGIN:nextjs-agent-rules -->

**# This is NOT the Next.js you know**

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

**# Arrakis Control Dashboard**

Use this map before searching. Keep it current when structure or core contracts change. Every file must follow `docs/architecture/file-organization.md`; that guide owns placement, naming, import boundaries, and root-clutter rules. `docs/architecture/repository-inventory.md` records the final directory inventory and migration record.

Assistant discovery paths stay native; shared guidance belongs here and in `docs/ai/`. Setup lives in `docs/ai/installation.md`. Run `npm run ai:check` after changing adapters. Keep the inventory concise; use `git ls-files` for the complete tracked list and preserve previous migration records in `docs/architecture/migration-history.md`.

**## Runtime**

- Stack: Node.js 22+, Next.js 16 App Router (V2 "Modern Dune" UI) with a remaining Pages Router `src/pages/api` layer, React 19, TypeScript, Tailwind CSS v4, npm, Redis (ioredis, standalone or Cluster), Vitest, and Playwright.

- Dev: `npm run dev`; defaults to `http://127.0.0.1:2008`, with `SERVER_HOSTNAME` and `SERVER_PORT` configurable in `.env`. Production: `npm run build`, then `npm start` with the same binding variables.

- Standard checks: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`.

- Extra checks: `npm run test:production` for runtime/API changes and `npm run test:browser` for UI behavior.

- `LOG_LEVEL=DEBUG` writes redacted metadata and compact background-poll diagnostics to the colored console only. Successful polling is omitted at `INFO`; warnings and failures remain visible. There are no log files or Sentry.

- Releases: bump the stable SemVer in `package.json` and add the matching `## Patch Notes vX.Y.Z` section to `CHANGELOG.md` (sections: New Features, Improvements, Fixes, Security, Privacy, Removed, Upgrade Notes, Community Contributions; omit empty ones). Successful `main` CI creates the tag and GitHub Release; the release job refuses any commit not already on `main`. CI shards browser tests across four runners; production smoke runs on the first shard.

- Only a new stable version creates a GitHub Release. The release job runs `scripts/deployment/build-pterodactyl-egg.mjs` and attaches `egg-arrakis-control-dashboard.json`. The egg downloads and builds the latest GitHub release in `/home/container` using Pterodactyl's standard Node.js 22 runtime. Wings supplies `SERVER_PORT`. There is no custom application image or GHCR publication.

**## Map**

- `src/proxy.ts` issues a per-request `'nonce-…'` CSP. Keep pages dynamically rendered because `APP_URL` is a runtime variable. The V2 shell dropped the old Announcify widget and seasonal themes; `proxy.ts` allows no third-party script, connect, or image origins beyond Discord's CDN.

- `src/app/` contains only routing and framework entry points. `/` and `/changelog` are public; signed-in routes live in `(workspace)/` (`portal`, `character`, `holdings` (+ `preview`), `storage`, `vehicles`, `market`, `bases` (marketplace, upload, detail), `guilds`, `guild`, `map`, `admin`). Every workspace page calls `requireSession()` itself. `src/app/api/v2/**` uses `src/server/http.ts`; `src/pages/api/**` remains the thin legacy API layer behind `runPagesApiHandler`.

- `src/components/` contains only shared UI: `navigation/` owns the single global topbar, its centralized route inventory, dropdowns, and mobile drawer; `brand/`, `layout/`, and `ui/` own their named shared concerns. Navigation may consume auth identity types and server actions; other shared UI must not import feature internals. Profile failure presentation belongs to `features/portal/components/profile-failure.tsx`. Do not restore the removed workspace navigation row or create another route inventory.

- `src/features/` is the only business-domain home. Current domains are `admin`, `auth`, `bases`, `bot`, `changelog`, `guilds`, `landing`, `map`, `market`, `player`, `portal`, `server-status`, and `vehicles`. Feature components, hooks, server operations, schemas, styles, types, and utilities stay with their domain. See the inventory for each domain's responsibility.

- `src/server/` contains shared request infrastructure only: `http.ts`, `pages-api.ts`, `api-read-cache.ts`, `cookies.ts`, `read-budget.ts`, and `integrations/` for Dune Console, adapter transport, Discord, and Discord webhooks.

- Security audit events go through `src/lib/security/audit.ts` (redacted, bounded, never throws); marketplace owner keys live in `features/bases/server/owner-key.ts` (HMAC, legacy keys still accepted until `npm run marketplace:rekey`).

- `src/lib/` contains focused shared modules: `redis/` (standalone/Cluster clients, hash-tagged keys, pool, optional data provider), `security/` (rate limiting and API capacity), `cache/`, `http/`, formatting, logging, errors, values, and server assertions. `lib/redis/` and `lib/security/` are server-only.

- `src/config/env.ts` is the canonical environment schema and production gate. There is no second environment module or unused version re-export.

- `src/types/` contains genuinely shared TypeScript contracts. Feature-local types remain in their feature.

- `src/styles/` contains global CSS and design tokens. `tailwind.config.ts` uses the Obsidian/Sand/Spice palette, sharp corners, and hard unblurred shadows. Feature CSS modules stay in their feature. Never animate an ancestor of the map or full-screen base preview layers, and keep all animation off under `prefers-reduced-motion`.

- `src/assets/` contains favicon/application images and compressed terrain/model bundles. It is large; do not enumerate it during ordinary work. Keep asset paths allowlisted and preserve the 2D map fallback.

- `scripts/server-launcher.mjs` prepares the writable Next.js image cache and starts dev/production. `scripts/maintenance/` owns Redis rekeying and offline model generation; `scripts/deployment/` owns release-egg generation.

- `src/instrumentation.ts` owns runtime validation, Console warmup, startup logging, population recording, and release announcement startup.

- `tests/` contains API, architecture, browser, deployment (sandboxed egg installer), production (built-runtime smoke), helpers, integration (real Redis, standalone or Cluster; opt-in through `TEST_REDIS_URL` / `TEST_REDIS_CLUSTER_NODES`, run with `npm run test:integration`), load, and domain-organized unit suites. Browser tests import `test`/`expect` from `tests/helpers/browser-test.ts`; shared domain routes are registered by `tests/helpers/portal-browser.ts`. Architecture tests enforce browser/server boundaries (including App Router client entry points, erased type imports, and server-action references), API boundaries, dependency acyclicity, naming, retired directories, and the root allowlist.

**## Feature contracts**

- `features/bases/` owns blueprint validation, owned-base export, base preview, storage/holdings UI, and `marketplace/`. Marketplace uses sanitized community records, newest-first bounded rank reads, owner-captured 640 × 360 PNGs, and owner-verified preview updates. Publication requires a picture; older listings retain layouts but require one before import. Imports normalize optional fields and preserve claim-console, size, ownership, and duplicate-delivery checks. `Change picture` updates the existing listing without changing rank.

- Base preview uses the shared map building-model catalogue, metre-scaled UE transforms, native per-item transforms, indexed pentashield sizes, partial coverage reporting, and disposal. Never infer yaw or swap left/right models from template names. Rebuild client models with `scripts/maintenance/build-client-models.mjs` against an extracted MapViewer3D bundle.

- `features/map/` owns 2D/3D map presentation, terrain, markers, and realtime polling. Marker identity must stay consistent across projections, React keys, model lifecycles, and searches. Allocate only the nearest 40 world models and dispose on range/filter/detail changes. Map HUD controls portal into the workspace toolbar; camera projection and terrain rendering share a frame.

- `features/guilds/` owns recruitment, applications, roster management, support conversations, unread receipts, logos, and question validation. Settings and mutations require freshly verified linked-character leadership (role 100), matching pawn and controller IDs; cached names/IDs never authorize edits. Console writes never retry.

- Guild applications keep at most 200 per guild, bounded 20-row reads, atomic duplicate prevention, and a 90-day inbox expiry refreshed by submissions. Acceptance adds the freshly verified linked character through Console before saving accepted status. Review leases serialize decisions and generation checks protect reapplications.

- Application questions support short text, paragraph, dropdown, timezone, checkbox, and decimal-number answers. Submission snapshots wording/type; changing questions during submission returns a retryable conflict. Dropdowns allow 30 unique choices; numeric answers remain strings.

- Guild and support chats retain at most 100 messages of 1,000 characters, deduplicate retried sends, expire with their parent records, and are removed with them. Only the applicant, freshly verified current leader, or separately authorized admin route may access the intended conversation. Poll while visible without overlap, back off on failure, preserve failed drafts, and abort on close. Loading status never marks messages read; exact visible message IDs are acknowledged explicitly.

- `features/admin/` owns the grouped administration catalog, manager screens, authorization, bounded uploads/downloads/streams, and guild oversight. Every admin page/API re-verifies the exact OAuth-verified admin ID, configured guild, role, and session. `ADMIN_CONSOLE_API_KEY` is separate; Console browser-only restrictions remain enforced. The catalog is an allowlist and never grants arbitrary provider URLs or headers.

- `features/bot/server/` owns the versioned read-only service API for sanitized guild-wide world data, using separate `BOT_API_TOKEN` authorization and no browser impersonation.

- `features/auth/` owns Discord OAuth, credentials, Redis-backed accounts/sessions, and Discord re-verification. `server/session-store.ts` is raw persistence; `server/session.ts` is the freshness orchestration used by every session reader. Keep them acyclic.

- Link previews use `generateMetadata` in `src/app/layout.tsx`; the retired Discord component-card module stays removed.

**## Contracts**

- API entry points delegate to feature handlers through `runPagesApiHandler`; the read-only binary route `src/pages/api/assets/[...path].ts` is the only intentional exception. V2 route handlers use `route()` from `src/server/http.ts`: same-origin mutation checks, `requireApiSession`, bounded bodies (`readBoundedBody`), no-store JSON, and safe errors.

- Browser code must not transitively import `src/config/env.ts`, `server/` directories, or server-only Redis/session/rate-limit/logger modules. Architecture tests enforce this.

- Normalize external payloads from `unknown`; never expose raw errors, credentials, admin payloads, or unbounded data. Keep unsafe-size numbers as decimal strings until display.

- Redis is the only persistent store and backs production sessions/rate limits. Do not add PostgreSQL or another database.

- Sign-in uses Auth.js (`features/auth/server/config.ts`, route `src/app/api/auth/[...nextauth]/route.ts`) with Discord OAuth and email/password. Credential accounts exist only after Discord signup sets a password on the Discord-verified email. Passwords are scrypt-hashed; never trust an email from a request body. Account records live in Redis keyed by Discord user ID.

- Both providers re-verify the guild role and issue a 30-day Redis session (`dashboard_session`, `__Host-` prefixed in production). Re-verification occurs when the last confirmation is over 30 minutes old. Definitive refusal deletes the session; Discord outages/rate limits allow at most 6 hours of grace. Sessions without a verification stamp receive no grace and must sign in once after deployment. Concurrent checks share work and a cross-instance lock protects rotating refresh tokens.

- Password login has per-address and per-email throttles. `TRUSTED_PROXY_COUNT` controls the forwarded address trusted by all per-IP limits: default `1`, or `0` without a proxy.

- Dune Console uses `Authorization: Bearer <CONSOLE_API_KEY>`. Do not restore Console password login, Console session cookies, CSRF, or automatic reauthentication. `ADAPTER_TOKEN` and `CONSOLE_API_KEY` are distinct; never merge them.

- `/items/*`, `/maps/*`, and `/favicon.ico` rewrite to the hardened asset route backed by `src/assets/`; terrain bundles use `/api/assets/terrain/*` directly. Do not recreate `public/`.

- Deep Desert terrain uses Console `coriolisLayout` values 0-11 and portable RGBA textures. Keep terrain paths allowlisted and preserve the image fallback when WebGL2 is unavailable.

- Preserve sanitized request IDs, method checks, private/no-store and security headers, same-origin mutation checks, POST-only logout, ownership checks, bounded provider responses/retries/timeouts, verified Discord guild-role authorization, host-prefixed production cookies, and recursive secret redaction. Operational provider errors omit stacks.

**## Environment**

- `.env` is ignored and secret; `.env.example` is the only committed template. Never print values or create `NEXT_PUBLIC_` secrets.

- `APP_URL` is the canonical public origin; the Discord callback is derived as `<APP_URL>/api/auth/callback/discord`. `AUTH_SECRET` (32+ characters) signs Auth.js state, seals stored refresh tokens, and is required in production. Do not add a separate redirect URI variable.

- Empty environment values normalize to absent values. Add or change variables in `src/config/env.ts`, `.env.example`, tests, and README together.

- Builds work without deployment secrets; production runtime does not.

**## Change discipline**

- Before changing Next.js behavior, read the local guide required above. Never edit the managed block.

- Prefer feature-module changes and keep page entry points thin. Add the smallest focused regression test.

- Keep `Dev note:` easter eggs inside executable code near real logic, never in file headers or non-code files. Sprinkle them selectively, allow multiple in complex files when each fits its nearby code path, and mix corny dad jokes with developer and Dune humor.

- For runtime, routing, environment, or infrastructure changes, run standard checks plus build and production smoke.

- Keep `package.json` and `package-lock.json` versions synchronized when bumping a release.

- Never commit generated `.next/`, `coverage/`, `test-results/`, `playwright-report/`, or `tsconfig.tsbuildinfo` output.

- The permanent documentation center is `docs/README.md` (getting-started, installation, configuration, features, integrations, administration, security, api, development, deployment, troubleshooting, reference). Run `npm run docs:check` after editing Markdown; it validates relative links and anchors. Keep behaviour descriptions in step with the code, and attribute RedBlink material (see `NOTICE.md`).
- Keep documentation in `docs/` and executable tools in `scripts/` according to the organization guide. Do not recreate removed `public/`, debug-output folders, Sentry files, PostgreSQL configuration, `src/modules/`, or `src/infrastructure/`.

- Preserve unrelated user changes. Do not perform broad cleanup outside the requested scope.
