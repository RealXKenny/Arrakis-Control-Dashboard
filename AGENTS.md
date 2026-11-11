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

- Dev: `npm run dev`; defaults to `http://127.0.0.1:2008`, with `SERVER_HOSTNAME` and `SERVER_PORT` configurable in `.env`. Production: `npm run build`, then `npm start` with the same binding variables. When `CHAT_ENABLED=true`, the launcher automatically supervises one Chat Bridge child; `npm run chat:bridge` is a standalone diagnostic command and must not run alongside that child.

- Standard checks: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`.

- Extra checks: `npm run test:production` for runtime/API changes and `npm run test:browser` for UI behavior.

- `LOG_LEVEL=DEBUG` writes redacted metadata and compact background-poll diagnostics to the colored console only. Successful polling is omitted at `INFO`; warnings and failures remain visible. There are no log files or Sentry.

- Releases: bump the stable SemVer in `package.json` and add the matching `## Patch Notes vX.Y.Z` section to `CHANGELOG.md` (sections: New Features, Improvements, Fixes, Security, Privacy, Removed, Upgrade Notes, Community Contributions; omit empty ones). Successful `main` CI creates the tag and GitHub Release; the release job refuses any commit not already on `main`. CI shards browser tests across four runners; production smoke runs on the first shard.

- Only a new stable version creates a GitHub Release. The release job runs `scripts/deployment/build-pterodactyl-egg.mjs` and attaches `egg-arrakis-control-dashboard.json`. The egg downloads and builds the latest GitHub release in `/home/container` using Pterodactyl's standard Node.js 22 runtime. Wings supplies `SERVER_PORT`. Supported dashboard deployments are direct Node.js and Pterodactyl; releases do not publish application container images.

**## Map**

- `src/proxy.ts` issues a per-request `'nonce-…'` CSP. Keep pages dynamically rendered because `APP_URL` is a runtime variable. The V2 shell dropped the old Announcify widget and seasonal themes; `proxy.ts` allows no third-party script, connect, or image origins. Discord avatars are served through authenticated same-origin URLs from a bounded Redis image cache (`features/auth/server/avatar.ts`). Only `/status` additionally allows the HetrixTools report frame; its resizer is bundled locally and the link stays under More.

- `src/app/` contains only routing and framework entry points. `/` and `/changelog` are public; signed-in routes live in `(workspace)/` (`portal`, `character`, `holdings` (+ `preview`), `storage`, `vehicles`, `market`, `bases` (marketplace, upload, detail), `guilds`, `guild`, `map`, `chat`, `status`, `events`, `casino` (+ `games/[game]`, `wallet`, `history`, `fairness`, `rules`), `admin`). Every workspace page calls `requireSession()` itself. `src/app/api/v2/**` uses `src/server/http.ts`; `src/pages/api/**` remains the thin legacy API layer behind `runPagesApiHandler`.

- `src/components/` contains only shared UI: `navigation/` owns the single global topbar, its centralized route inventory, dropdowns, and mobile drawer; `brand/`, `layout/`, and `ui/` own their named shared concerns. Navigation may consume auth identity types and server actions; other shared UI must not import feature internals. Profile failure presentation belongs to `features/portal/components/profile-failure.tsx`. Do not restore the removed workspace navigation row or create another route inventory. Home (`/`, exact) is the first inventory entry for signed-in members, with a compact icon below 1280px that the mobile drawer does not repeat.

- `src/features/` is the only business-domain home. Current domains are `admin`, `auth`, `bases`, `bot`, `casino`, `changelog`, `chat`, `events`, `guilds`, `landing`, `map`, `market`, `player`, `portal`, `server-status`, and `vehicles`. Feature components, hooks, server operations, schemas, styles, types, and utilities stay with their domain. See the inventory for each domain's responsibility.

- `features/seasons/` owns free community season definitions, calendar-based challenges, reviewed evidence, independent XP, immutable published cosmetics, claims, equipment, cooperative milestones and archives. Redis is authoritative; all atomic season keys share `{seasons}`. Published definitions never mutate; corrections append events. Member owners come only from the session. In-game delivery proposals require separate administrator review and cannot execute game writes. See `docs/features/community-seasons.md` for bounds and verification status.

- Season uploads are admin-only raster images decoded and re-encoded to bounded immutable WebP records, served through authenticated same-origin reference checks. Scheduled/active seasons allow only a separate presentation overlay (subtitle, description, theme, hero artwork), with UUID CAS, Redis deadline checks and permanent before/after snapshots; reward definitions and completed seasons remain frozen. Visible community polling uses bounded aggregate responses, monotonic versions, cancellation and backoff. Game delivery execution stays disabled.

- `src/server/` contains shared request infrastructure only: `http.ts`, `pages-api.ts`, `api-read-cache.ts`, `cookies.ts`, `read-budget.ts`, and `integrations/` for Dune Console, adapter transport, Discord OAuth, and shared bot announcements.

- Security audit events go through `src/lib/security/audit.ts` (redacted, bounded, never throws); marketplace owner keys live in `features/bases/server/owner-key.ts` (HMAC, legacy keys still accepted until `npm run marketplace:rekey`).

- `src/lib/audio/` owns the opt-in browser audio manager, synthesized sound registry, voice queue, local recording registration, and feedback hook. Shared sound settings live in `components/ui/audio-controls.tsx`; casino narration consumes only confirmed public round views. The default Kokoro voice pack is pre-generated under `src/assets/audio/casino/solaris-v1/`, served by the exact asset manifest allowlist, and composed by `features/casino/audio/voice-pack.ts`; deployment never runs TTS inference. Audio never controls gameplay, and no external audio service is required.

- `src/lib/` contains focused shared modules: `redis/` (standalone/Cluster clients, hash-tagged keys, pool, optional data provider), `security/` (rate limiting and API capacity), `cache/`, `http/`, formatting, logging, errors, values, and server assertions. `lib/redis/` and `lib/security/` are server-only.

- `src/config/env.ts` is the canonical environment schema and production gate. There is no second environment module or unused version re-export.

- `src/types/` contains genuinely shared TypeScript contracts. Feature-local types remain in their feature.

- `src/styles/` contains global CSS and design tokens. `tokens.css` mirrors the Tailwind palette as `--color-*` variables because plain CSS reads them and Tailwind v4 does not emit JS-config colours as variables; `tests/unit/styles/tokens.test.ts` guards the match. `tailwind.config.ts` uses the Obsidian/Sand/Spice palette, sharp corners, and hard unblurred shadows. Feature CSS modules stay in their feature. Never animate an ancestor of the map or full-screen base preview layers, and keep all animation off under `prefers-reduced-motion`.

- `src/assets/fonts/` contains the pinned Archivo (weight/width) and JetBrains Mono variable fonts and their OFL licenses. The root layout uses `next/font/local`, preserving `--font-sans` / `--font-mono`; builds and browsers never fetch Google Fonts. Provenance is in `docs/legal/font-provenance.md`.

- `src/assets/` contains favicon/application images and compressed terrain/model bundles. It is large; do not enumerate it during ordinary work. Keep asset paths allowlisted and preserve the 2D map fallback.

- `scripts/server-launcher.mjs` prepares the writable Next.js image cache and starts dev/production; `scripts/chat-bridge-supervisor.mjs` owns the automatic bridge child's restart and shutdown lifecycle. `scripts/maintenance/` owns Redis rekeying and offline model generation; `scripts/deployment/` owns release-egg generation.

- `src/instrumentation.ts` owns runtime validation, Console warmup, startup logging, population recording, and release announcement startup.

- `tests/` contains API, architecture, browser, deployment (sandboxed egg installer), production (built-runtime smoke), helpers, integration (real Redis, standalone or Cluster; opt-in through `TEST_REDIS_URL` / `TEST_REDIS_CLUSTER_NODES`, run with `npm run test:integration`), load, and domain-organized unit suites. Browser tests import `test`/`expect` from `tests/helpers/browser-test.ts`; shared domain routes are registered by `tests/helpers/portal-browser.ts`. Architecture tests enforce browser/server boundaries (including App Router client entry points, erased type imports, and server-action references), API boundaries, dependency acyclicity, naming, retired directories, and the root allowlist.

**## Feature contracts**

- `features/chat/` owns the bot-compatible `chat.map` protocol, Chat Bridge worker, bounded Redis Stream history, Pub/Sub distribution, authenticated SSE gateway, and Live Chat UI. Each launcher-supervised worker consumes its own exclusive broker-generated `amq.gen-*` queue, matching existing bot permissions; never declare named queues or custom dead-letter exchanges. Redis owns persistent history, and events sent while no worker is connected are not buffered. Next.js eagerly starts a persistent publisher but never starts a consumer. The cached server-only TLS loader validates inline PEM before path fallbacks; verification cannot be disabled. Preserve exact map keys, stable external-ID deduplication, persona echo suppression, honest broker-only `published` status, and no automatic retry of uncertain sends.

- Outgoing chat may retry confirmed publish failures at most three total attempts with one stable ID; uncertain sends never retry automatically. Unpublished dashboard payloads never enter public history or SSE. The sender sees terminal failures only in local dismissible notices; keep bounded server idempotency records and private reconciliation to avoid republishing or losing late confirmed states.

- Discord relay presentation requires exact `CHAT_DISCORD_BOT_FUNCOM_ID` identity plus the reference bot's `[Discord]` prefix/format. Keep original text in `content`, extracted display body in `relayContent`, and source `discord`; genuine player prefix imitations stay `game`. Parsed relay names and `[Owner]` tags never authorize dashboard actions. Older game-source history is classified on read without rewriting Redis.

- `features/casino/` owns The Solaris Exchange: every wager is REAL in-game Solaris held in a Redis casino wallet (no demo currency), and the server refuses every wager and transfer unless `CASINO_SOLARIS_ENABLED=true` (default `false`). Wager and payout ceilings are `CASINO_MAX_WAGER` and `CASINO_MAX_PAYOUT`. The ledger (`ledger/`, `server/wallet-store.ts`) is exact BigInt, append-only and idempotent; balance only grows by a Console-confirmed deposit or a settled payout. Deposits and withdrawals use `GET /api/players/{id}/currency` (Solaris is `currency_id` 0, balances are strings) and `POST .../add-currency`; the Console writes to the database and loads the change when the player next joins, so the character must be OFFLINE (fresh check) and the Console reply must name Solaris, the exact amount, `Offline` and the exact expected balance or the transfer is parked in `needs_reconciliation`, never retried, and settled by an administrator at `/casino/admin`. Games are pure modules registered in `games/registry.ts`; the round engine (`engine/`) reserves, settles, voids and recovers rounds, and hidden state (Mines board, Blackjack shoe, Crash point) is never part of an open-round view. Seeds are committed before play and rotation is refused while a round is open. Routes under `src/app/api/v2/casino/` derive the owner from the session only; see `docs/features/solaris-exchange.md`.

- `features/bases/` owns blueprint validation, owned-base export, base preview, storage/holdings UI, and `marketplace/`. Marketplace uses sanitized community records, newest-first bounded rank reads, owner-captured 640 × 360 PNGs, and owner-verified preview updates. Publication requires a picture; older listings retain layouts but require one before import. Imports normalize optional fields and preserve claim-console, size, ownership, and duplicate-delivery checks. `Change picture` updates the existing listing without changing rank.

- Base preview uses the shared map building-model catalogue, metre-scaled UE transforms, native per-item transforms, indexed pentashield sizes, partial coverage reporting, and disposal. Never infer yaw or swap left/right models from template names. Rebuild client models with `scripts/maintenance/build-client-models.mjs` against an extracted MapViewer3D bundle.

- `features/map/` owns 2D/3D map presentation, terrain, markers, and realtime polling. Marker identity must stay consistent across projections, React keys, model lifecycles, and searches. Allocate only the nearest 40 world models and dispose on range/filter/detail changes. Map HUD controls portal into the workspace toolbar; camera projection and terrain rendering share a frame.

- `features/guilds/` owns recruitment, applications, roster management, support conversations, unread receipts, logos, question validation, the private noticeboard, operations planning, and resource requests. Operations require fresh membership for private reads and self-signups; only leaders manage schedules. UUID revisions and canonical roster IDs enforce one signup per character and atomic role capacities, with at most 20 operations/50 slots, retention covering scheduled ends plus 90 days, and disband cleanup. Noticeboard reads require fresh linked-character membership; leader writes use UUID revision checks, at most 20 announcements (5 pinned), 90-day inactivity expiry, and disband cleanup. Management settings and leader-only actions require freshly verified linked-character leadership (role 100), matching pawn and controller IDs; cached names/IDs never authorize edits. Console writes never retry.

- Guild resource requests require fresh membership for all reads/actions and canonical character IDs for ownership. Requester/leader management, separate supplier reports and receipt confirmation (never self-confirmation), exact string quantities, UUID revisions, 20 guild records/5 open per character/20 pledge receipts, 90-day inactivity retention, and disband cleanup are enforced server-side. Tracking never moves inventory or currency.

- `features/guilds/` also owns the private shared base directory: fresh membership for reads and role-100 leadership for writes, 50 manually entered listings, atomic UUID revisions, 90-day inactivity retention and disband cleanup. Locations, contact details and access instructions are coordination metadata; directory entries never verify ownership, grant game access or publish/import blueprints. Search stays local to the browser.

- Guild applications keep at most 200 per guild, bounded 20-row reads, atomic duplicate prevention, and a 90-day inbox expiry refreshed by submissions. Acceptance adds the freshly verified linked character through Console before saving accepted status. Review leases serialize decisions and generation checks protect reapplications.

- Application questions support short text, paragraph, dropdown, timezone, checkbox, and decimal-number answers. Submission snapshots wording/type; changing questions during submission returns a retryable conflict. Dropdowns allow 30 unique choices; numeric answers remain strings.

- Guild and support chats retain at most 100 messages of 1,000 characters, deduplicate retried sends, expire with their parent records, and are removed with them. Only the applicant, freshly verified current leader, or separately authorized admin route may access the intended conversation. Poll while visible without overlap, back off on failure, preserve failed drafts, and abort on close. Loading status never marks messages read; exact visible message IDs are acknowledged explicitly.

- `features/admin/` owns the grouped administration catalog, manager screens, authorization, bounded uploads/downloads/streams, and guild oversight. Every admin page/API re-verifies the exact OAuth-verified admin ID, configured guild, role, and session. `ADMIN_CONSOLE_API_KEY` is separate; Console browser-only restrictions remain enforced. The catalog is an allowlist and never grants arbitrary provider URLs or headers.

- `features/bot/server/` owns the versioned read-only service API for sanitized guild-wide world data, using separate `BOT_API_TOKEN` authorization and no browser impersonation.

- `features/auth/` owns Discord OAuth, credentials, Redis-backed accounts/sessions, and Discord re-verification. `server/session-store.ts` is raw persistence; `server/session.ts` is the freshness orchestration used by every session reader. Keep them acyclic.

- Link previews use `generateMetadata` in `src/app/layout.tsx`; the retired Discord component-card module stays removed.

- `features/events/` owns bounded Redis community event announcements, one-time competition seeding, visibility and revision checks, and automatic Discord Components V2 synchronization. Admin event management is in `features/admin/components/events-manager.tsx`; drafts never enter member reads, and event prizes never call inventory or currency APIs. Events and changelogs share `DISCORD_BOT_TOKEN` through the server-only Discord bot integration; uncertain creations never auto-resend.

- `features/player/server/item-finder.ts` owns the Storage universal finder. Resolve a fresh adapter link per search; use player-scoped discovery, independent canonical controller roster checks and per-container child access. Never return base-wide rollups or world/admin inventories. Keep three workers, provider/overall deadlines, cancellation, six searches/member/minute, bounded asset/container/stack/result counts and honest source coverage. No game guild or game writes are needed.

- `features/player/server/item-pins-store.ts` owns private per-account/per-linked-pawn/controller pin preferences: 12 unique template IDs, 8 KiB records, single-key UUID CAS and 90-day inactivity expiry. Counter reads reuse fresh finder permissions and guard character-link changes, aggregate exact BigInt observations from at most 5,000 stacks and return only totals/coverage. Keep N001's public 200-result cap. Unknown or failed coverage is a lower bound, never a complete zero; no inventory snapshots or game writes are persisted. N002 routes live under `/api/v2/items/pins` and use same-origin bounded settings writes.

**## Contracts**

- Guild polls live in `features/guilds/`: fresh membership on every read/action, leader-only publication/early closure/removal and one canonical-character ballot per poll. Published questions/options/deadlines are immutable; members may change/withdraw until closing. Preserve 20 polls/500 voters/128 KiB records, UUID compare-and-set, Redis commit-time deadline checks, retention covering scheduled close plus 90 days and disband cleanup. Member views expose aggregate totals and own choice only; server-side ballots are private but are not secret ballots. No automatic write retries, announcements or game mutations.

- Guild recruit onboarding lives in `features/guilds/`: fresh roster membership on every request, leader-only guide/mentor/progress management, member-only self-completion and current-rules acknowledgment. Guild-specific character references identify one shared progress record across linked accounts; only leaders see the overview. Preserve 20 steps/200 progress records/500 roster entries, 256 KiB bounded CAS storage, 90-day inactivity retention and disband cleanup. Edited steps invalidate affected completions and changed rules rotate acknowledgment revisions. Mentors must be different current members; onboarding never grants game permissions or changes rank.

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

- The permanent documentation center is `docs/README.md` (getting-started, installation, configuration, features, integrations, administration, security, api, development, deployment, troubleshooting, reference). Run `npm run docs:check` and `npm run docs:format:check` after editing Markdown; they validate relative links/anchors and formatting of changed docs. Keep behaviour descriptions in step with the code, and attribute RedBlink material (see `NOTICE.md`).
- Keep documentation in `docs/` and executable tools in `scripts/` according to the organization guide. Do not recreate removed `public/`, debug-output folders, Sentry files, PostgreSQL configuration, `src/modules/`, or `src/infrastructure/`.

- Preserve unrelated user changes. Do not perform broad cleanup outside the requested scope.

**## GitHub automation**

- `CI / Required Checks` in `.github/workflows/ci.yml` is the stable required status check. Keep its pull-request, protected-branch push, and merge-queue triggers free of path filters, and include every mandatory CI job in its `needs` list.
- Keep workflows least-privileged, secret-free for pull requests, explicit about job timeouts, and pinned to verified immutable action SHAs. Do not execute untrusted pull-request code in privileged triggers.
- Run `npm run workflows:check` for workflow and Dependabot YAML, permission, action-pin, dependency, and aggregate-gate validation. CI also runs actionlint.
- See [GitHub Actions](docs/development/github-actions.md) and [GitHub branch rulesets](docs/development/github-branch-rulesets.md) for workflow behavior, exact check names, and manual GitHub configuration. Never modify remote rulesets or publish releases without explicit approval.
