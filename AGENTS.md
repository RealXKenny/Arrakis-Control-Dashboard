<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Arrakis Control Dashboard

Use this map before searching. Keep it current when structure or core contracts change.

## Runtime

- Stack: Node.js 22+, Next.js 16 Pages Router, React 19, TypeScript, npm, Redis, Vitest, and Playwright.
- Dev: `npm run dev`; defaults to `http://127.0.0.1:2008`, with `SERVER_HOSTNAME` and `SERVER_PORT` configurable in `.env`. Production: `npm run build`, then `npm start` with the same binding variables.
- Standard checks: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`.
- Extra checks: `npm run test:production` for runtime/API changes; `npm run test:browser` for UI behavior.
- `LOG_LEVEL=DEBUG` writes redacted metadata and compact background-poll diagnostics to the colored console only. Successful polling is omitted at `INFO`; warnings and failures remain visible. There are no log files or Sentry.
- Releases: bump the stable SemVer in `package.json` and add the matching `## [X.Y.Z] - YYYY-MM-DD` section to `CHANGELOG.md`; successful `main` CI creates the tag and GitHub Release.
- Only a new stable version release publishes `ghcr.io/realxkenny/arrakis-control-dashboard:latest`, `v<version>`, and `sha-<commit>` images after successful `main` CI. The importable egg is `pterodactyl/egg-arrakis-control-dashboard.json`; its allocated `SERVER_PORT` comes from Wings.

## Map

- `src/pages/_app.tsx` loads the shared Announcify announcement widget with its public project ID and explicit API origin. `src/proxy.ts` allows the vendor script, API, hosted images, and Google Fonts assets through CSP.
- `src/modules/marketplace/` owns sanitized base sharing and community listings. Redis stores negative publication timestamps for newest-first order; catalog reads use bounded rank ranges, never positive score bounds. Cards use owner-captured 640 × 360 PNGs, never automatic front detection or WebGL thumbnails. Owner-verified `/api/bases/[baseId]/preview` stores normalized front views and bounded pictures in Redis; saving a picture updates an existing listing without changing its rank. Publication requires a picture; older listings without one retain their layouts but require the owner to capture a picture before marketplace import is offered. Sharing and JSON uploads prompt for a front; capture framing fits all rendered pieces while preserving the selected angle. Marketplace imports normalize optional export fields and use the shared `bases/utils/import-blueprint.ts` delivery path without weakening import validation.

- Marketplace listing responses derive session-specific `editableBaseId` hints from verified owned-base IDs and the original publisher/base hash, including legacy listings. `MarketplaceCard.tsx` offers **Change picture** only for those listings, captures the published layout, and updates the saved picture through the ownership-checked preview endpoint without republishing.

- `src/components/Topbar.tsx` and `topbar.module.css` provide shared pill navigation across public, member, and admin pages. `src/styles/pillbox-theme.css` owns the neutral Tailwind palette and fluid `workspace-frame` gutters; the page shell uses it without a fixed desktop width cap.

- `src/pages/`: thin Pages Router pages/API entry points. `/` is the public landing page; `next.config.ts` redirects legacy `/home` links there and preserves query strings. `/portal` remains the signed-in workspace. There is no separate public operations dashboard.
- `src/modules/<feature>/`: UI, hooks, normalization, utilities, and server handlers for `auth`, `bases`, `changelog`, `guilds`, `home`, `map`, `player`, and `portal`.
- `src/infrastructure/`: Dune Console/adapter and Discord clients, API boundary, cookies, and API cache. Start with `dune.ts`, `dunedocker/transport.ts`, or `pages-api.ts`.
- `src/lib/`: server guards, sessions, rate limits, logging, errors, timeouts, and shared caches. `src/lib/env.ts` is the canonical environment schema (`src/config/env.ts` re-exports it); `src/lib/redis-client.ts` is the ioredis pool/cluster + circuit breaker behind the dashboard data provider.
- `src/config/`: authoritative server environment schema, production validation, and the dev/production server launcher.
- `src/instrumentation.ts`: runtime validation, Console warmup, startup log, and population recorder.
- `src/assets/`: favicon, application images, and compressed Deep Desert terrain bundles. It is large; do not enumerate it unless necessary.
- `src/modules/map/terrain/`: lazy Three.js scene for both maps, measured terrain, and local vehicle/building/worm models. `MapScene3D.tsx` owns camera/disposal, `sceneGeometry.ts` aligns markers with rendered terrain triangles, and `sceneModels.ts` bounds model lifecycles. The 2D WebGL2/image viewer is the automatic compatibility fallback. Model/terrain assets remain allowlisted and base exports retain ownership checks.
- `src/modules/bases/components/BasePreview.tsx` lazily opens one owned-base renderer using the shared `buildingModels.ts` catalogue. Visual GLB and native models share metre-scaled UE X/Z/Y axes and native actor/catalogue transforms; never infer yaw or swap left/right models from template names. `utils/model-export.ts` bounds authorized export requests; preserve native per-item transforms, indexed pentashield sizes, partial coverage reporting, and disposal. `src/modules/portal/components/BaseInventory.tsx` owns the responsive storage dialog and keyboard focus lifecycle.
- `src/modules/sharing/`: public Discord component-card JSON and Open Graph/Twitter metadata, rendered before hydration on `/` and `/portal`. Only the canonical `APP_URL` origin enters page props. Keep the payload below 3,000 bytes, link-only buttons, no member data, and the versioned PNG allowlist under `/api/assets/share/`.
- `src/modules/map/utils/markers.ts` distinguishes static template IDs by location and deduplicates samples before legend filtering. Live object keys retain identity during movement and include instance identity. Projection lookups, React keys, model lifecycles, and search results must use the same identity function. `terrain/worldModels.ts` generates spice/wreck/flour-sand models; `sceneModels.ts` allocates only the nearest 40 and disposes them on range/filter/detail changes. Map HUD controls portal into the workspace toolbar; camera projection and terrain rendering stay in the same frame.

- `src/modules/theme/`: local calendar theme matrix, pure resolver, and pre-paint browser controller; `/api/theme-script` serves CSP-compatible JavaScript. Palette styles live in `src/styles/global.css`; `src/styles/pillbox-theme.css` binds the modern UI accent to them. Optional class/message/asset metadata is applied without inserting layout elements.
- `src/modules/bot/server/`: versioned read-only service API for sanitized guild-wide world data; separate `BOT_API_TOKEN` authorization, no browser session impersonation.
- `src/modules/admin/`: admin workspace and the supplied Console API reference catalog. `/admin` and `/api/admin/*` revalidate the exact OAuth-verified admin ID, configured guild, role, and session. The admin route has no navigation links on public or member pages. Separate `ADMIN_CONSOLE_API_KEY`; Console browser-only restrictions remain enforced. Upload/download/event streams are bounded; all API entry points still use the common boundary.
- `src/lib/api-capacity.ts`: per-worker API admission budget before Redis work. Read-cache overflow returns 503; realtime snapshots coalesce for one second after per-request authorization. `tests/load/dashboard.k6.js` is the optional staging load harness.
- `src/modules/map/server/realtime.ts`: Console snapshots available to all signed-in dashboard members of the configured guild; `hooks/useRealtimeData.ts` polls every two seconds with instance selection. No separate realtime role is required; anonymous player/vehicle objects are excluded.
- `tests/`: API, architecture, unit, browser, helpers, and `smoke-production.mjs`.
- Root runtime behavior: `src/proxy.ts` (Middleware renamed in Next.js 16) and `next.config.ts`. `docker-compose.yml` runs the app beside a local Redis for development.

## Contracts

- API entry points delegate to feature handlers through `runPagesApiHandler`. The read-only binary route `src/pages/api/assets/[...path].ts` is the only intentional exception.
- Browser code must not transitively import infrastructure, `src/config/env.ts`, `server` directories, or server-only Redis/session/rate-limit/logger modules. Architecture tests enforce this.
- Normalize external payloads from `unknown`; never expose raw errors, credentials, admin payloads, or unbounded data. Keep unsafe-size numbers as decimal strings until display.
- Redis is the only persistent store and backs production sessions/rate limits. Do not add PostgreSQL or another database.
- Dune Console uses `Authorization: Bearer <CONSOLE_API_KEY>`. Do not restore password login, session cookies, CSRF, or automatic reauthentication.
- `ADAPTER_TOKEN` is distinct from `CONSOLE_API_KEY`; never interchange or merge these credentials.
- `/items/*`, `/maps/*`, and `/favicon.ico` rewrite to the hardened asset route backed by `src/assets/`; terrain bundles use `/api/assets/terrain/*` directly. Do not recreate `public/`.
- Deep Desert terrain uses Console `coriolisLayout` values 0-11 and portable RGBA textures. Keep terrain paths allowlisted and preserve the image fallback when WebGL2 is unavailable.
- Preserve sanitized request IDs, method checks, private/no-store and security headers, same-origin mutation checks, POST-only logout, ownership checks, bounded provider responses/retries/timeouts, verified Discord guild-role authorization, host-prefixed production cookies, and recursive secret redaction. Operational provider errors omit stacks.

## Environment

- `.env` is ignored and secret; `.env.example` is the only committed template. Never print values or create `NEXT_PUBLIC_` secrets.
- `APP_URL` is the canonical public origin; the Discord callback is derived as `<APP_URL>/auth/callback`. Do not add a separate redirect URI variable.
- Empty environment values normalize to absent values. Add or change variables in `src/lib/env.ts`, `.env.example`, tests, and README together.
- Builds work without deployment secrets; production runtime does not.

## Change discipline

- Before changing Next.js behavior, read the local guide required above. Never edit the managed block.
- Prefer feature-module changes and keep page entry points thin. Add the smallest focused regression test.
- Keep `Dev note:` easter eggs inside executable code near real logic, never in file headers or non-code files. Sprinkle them selectively, allow multiple in complex files when each fits its nearby code path, and mix corny dad jokes with developer and Dune humor.
- For runtime, routing, environment, or infrastructure changes, run standard checks plus build and production smoke.
- Keep `package.json` and `package-lock.json` versions synchronized when bumping a release.
- Never commit generated `.next/`, `coverage/`, `test-results/`, `playwright-report/`, or `tsconfig.tsbuildinfo` output.
- Do not recreate removed `docs/`, `scripts/`, `public/`, debug-output folders, Sentry files, PostgreSQL configuration, or `CLAUDE.md`.
- Preserve unrelated user changes. Do not perform broad cleanup outside the requested scope.
