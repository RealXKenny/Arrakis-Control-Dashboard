# Portal rebuild and release acceptance

## Design direction

Reference inspected: https://portal.lastsietch.com/ and its public field manual, September 6, 2026. After the user signed in, inspected and scrolled Dashboard, Character, Storage, Exchange, Bases and Settings in their main Edge browser. Only read-only navigation was used. Adopted grouped navigation, condensed headings, corner rules, instrument cards, a two-column dossier and a three-column storage workspace. Restored the original brown surfaces, cream text and gold accents at the user’s request. Saira, Saira Condensed and JetBrains Mono is bundled locally through Fontsource. Crimson Skies retains its own branding and content. No reference assets or private implementation were copied.

The portal has Dashboard, Character, Storage, Exchange, Bases, Vehicles and Guild views at `/portal?view=...`; the live map remains `/map`. URLs preserve back/forward navigation and can be bookmarked. Base and vehicle grids are two columns above 900px: an odd final card spans the last row. The shell now uses the reference’s measured 1080px frame with 16px inner gutters; this supersedes the previous 2280px width after the user requested an exact visual match. Mobile navigation scrolls within its own container.

## Signed-in screen adaptation

- Dashboard: server population, personal currency and holdings counts, guild and character shortcuts, vitals.
- Character: identity banner, progression, faction and specialization records, equipment/loadout, grouped journey completion.
- Storage: asset summary, container selection, search and grid/list controls. Read-only player inventory; no item grants, transfers or fabricated bank balances.
- Exchange: paginated search with exact bigint formatting, summary cards and selectable item intelligence sidebar.
- Bases/vehicles: operational telemetry, ownership tabs, authorized blueprint export and requested 2+1/2+2 layouts.
- Guild: server-reported membership and rank; management remains in game.

Provider contracts checked against the [Console API reference](https://github.com/Red-Blink/dune-awakening-selfhost-docker/blob/main/docs/console/API-REFERENCE.md) and its player UI adapters. Inventory consumes item_name, stack_size, quality_level and inventory_type values 0/1/15/30. Journey consumes story/contract/codex/tutorial groups. Missing responses remain distinct from empty inventories. Vehicles now use the linked player’s scoped endpoint instead of sending all server vehicles to the browser. Clients cannot select another player ID.

No reference account data or artwork was copied into the application. The reference’s community blueprint marketplace, 3D preview, account identity codes and private messaging are not replicated. They require separate persisted and authorized backend implementations. The user subsequently cancelled the Console extension: backend-dependent rewards, bank transfers, trading writes and Karum are excluded. A clean reference checkout was inspected at D:/dune-console-portal; no Console code was modified.

## Code and architecture

- Shared `src/components/DashboardShell.tsx` accepts presentation and navigation props. Feature routes, data and account actions remain in their modules.
- Portal transformation moved from the page into `utils/character.ts`. Removed five obsolete portal state/header/navigation components; loading, errors and account recovery now keep the same shell.
- Replaced the repeated global landing themes with shared defaults. Moved map marker CSS into `src/modules/map/markers.css`, deduplicating 200 rules to 105 while preserving rule order. Pages Router loads feature global CSS through `_app.tsx`.
- Reformatted source and tests consistently with Prettier. CI rejects formatting drift and ESLint warnings.
- Player, map and public status polling now cancel work when unmounted, bound request duration, prevent overlapping polls, and pause in hidden tabs. Manual refresh remains available. Player failures retain and label the last successful readings; 401 clears private content and offers deliberate sign-in without a redirect loop.
- Missing health, progression and balances are displayed as unavailable, not fabricated full health or zero balances.
- Existing API wrappers, validated server environment, opaque 12-hour sessions, POST logout and server/browser boundaries remain in place.
- Blueprint export now resolves the linked player server-side and requires ownership before invoking the privileged Console endpoint. Shared access does not grant export permission. Removed the import button because `/api/blueprints/import` was never implemented.

## Verification

Run `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:production`, and `npm run test:browser`.

Browser setup: `npx playwright install chromium` locally, or `npx playwright install --with-deps chromium` on Linux CI. Browser tests stub API responses, including failures, without adding test endpoints or fake data to the production application. The signed-in adaptation passed 55 unit/API tests and 8 browser tests. Tests cover real rendering, character readings, storage filters and grid/list views, market selection, navigation, market refresh, 2+1 and 2+2 grids, mobile overflow and map rendering. Screenshots and failure traces are under `test-results/`. The separate production smoke uses isolated Redis/Dune transports to exercise actual API code, including logout prefetch and session revocation.

## Remaining production acceptance

This is a tested rebuild, not a guarantee of universal production readiness. Before deployment acceptance, verify Discord login, Redis persistence, role mappings, Console endpoint permissions and owned-base export with the real development server. Then conduct a load test representative of player count and a restore/recovery exercise for Redis. Automated fixtures do not prove live-provider contracts or operational capacity.

The repository still has legacy permissive TypeScript (`strict: false`) and flexible provider payload handling. A full strict-mode/validated-DTO migration remains separate work; do not describe this repository as fully strictly typed. Player guild lookup still scans upstream guild membership and should be replaced by a verified direct lookup or bounded cache before large-scale deployment.

The reference's rewards, bank transfers, trading writes, messaging, events, Landsraad and storm histories are not implemented here. They require additional server contracts, authorization, persistence and transaction semantics. No placeholder navigation or invented live values are shipped for them. The existing map keeps its terminal interactions rather than duplicating the reference's separate map engine.

Redeploy the built application to see changes on `dev.crimson-skies.org`; this work does not itself publish to that host. Keep the previous deployment available for rollback.

## Measured visual correction

Read the reference’s publicly served design tokens to verify typography, 4/8/12/16/24/32px spacing, 1080px frame, sticky masthead and navigation proportions. The portal retains the requested original brown/gold palette and supported feature set. This is not full feature parity: omitted systems are explicitly out of scope after the user cancelled Console changes. Added a read-only price-ladder endpoint over the existing Console API and validated server-side owner/sort filters.

## Dashboard world briefing

The dashboard now follows the reference's briefing-first composition: compact server/map strip, a large conditional world headline, four linked instrument cards, and two-column guild, holdings, population and Landsraad panels. Brown/gold colors remain. The overview no longer repeats the full character vitals and large destination tiles; character details remain on the Character page.

Validated the documented read-only contracts at https://docs.dunedocker.app/reference/http-api/api-reference against the configured Console using local credentials. Login, map partitions/markers, exchange stats and Landsraad reads returned HTTP 200. No game-state mutations or Console modifications were made. The server currently reports spice fields and Coriolis timing, but no live sandstorm actors; the briefing therefore reports spice rather than claiming a storm is active.

`/api/portal/world` authenticates each request, accepts only DeepDesert/HaggaBasin, coalesces and caches sanitized readings for 30 seconds, and isolates partial upstream failures. Only counts, spice sectors, cycle dates and term aggregates reach the browser; raw map actors and administrative contribution records do not. Browser polling is cancellable, time-bounded, paused when hidden, and stops on 401. Map shortcuts preserve the selected map. Historical population charts, transactional rewards and banking remain excluded; Landsraad now has a supported read-only term summary.

Validation: 60 unit/API tests, 10 browser tests, typecheck, zero-warning lint, formatting, production build and runtime smoke passed. Desktop and mobile overview screenshots were visually inspected. Browser screenshots use isolated fixture data. Live provider checks validate current response shapes; deployment and real user OAuth acceptance remain separate.

## 24-hour World Pulse and reference layout

The overview now has four summary cards, a three-card guild/holdings/character row, and separate full-width World Pulse and Landsraad sections. Live spice headings and the population curve use blue accents; the original brown/gold surfaces remain. Landsraad counts completed tasks by the reported winning faction and excludes Sysselraad tasks.

World Pulse records an aggregate online-player count once per minute using the documented `/api/players/online?page=0&pageSize=1` endpoint. Next's Node instrumentation starts the recorder independently of browser activity. Redis minute leases suppress duplicate sampling across workers/replicas; samples older than 24 hours are pruned and the history key expires after 48 hours without updates. No player names or account identifiers are recorded. `POPULATION_HISTORY_ENABLED=false` disables this feature. A continuously running Node process is required; serverless deployments would need a separate scheduled collector.

The graph starts with real observations after deployment; it cannot reconstruct the preceding day from the current-population API. Missing intervals longer than 90 seconds remain gaps. Estimated play-hours integrate only observed adjacent readings, and the UI labels the observed coverage. Individual samples can be inspected with a keyboard-accessible slider. Fixture history is used only in browser tests, never production.

Validation: 65 unit/API tests, 10 browser tests, typecheck, zero-warning lint, format, production build and runtime smoke passed. Desktop and mobile screenshots reviewed. Live Console login succeeds, but the Redis hostname in the local `.env` returns DNS `ENOTFOUND`; real history persistence could not be verified locally. Correct the Redis connection on the running deployment before expecting samples. Do not describe the fixture graph as historical live-server data.
