# Repository inventory

Console-inspired polish adds shared `status-badge.tsx` and `state-panel.tsx`, compact optional descriptions in `PageHeader`, normal-case typography and soft surface/button styling. Mobile navigation presents the existing filtered inventory as one/two-column grouped tiles without a second route catalog; native document-navigation security boundaries remain intact. `tests/browser/console-style.spec.ts` covers PC widths, narrow/mobile grids, permissions, focus and accessibility. Reference and screenshots are in the [shared UI guide](../development/shared-ui.md).

Shared primitives in `src/components/ui/button.tsx`, `card.tsx` and `control-styles.ts` own native buttons, semantic cards and menu/control styles across features. `src/lib/ui/` owns browser-safe focus, reference-counted scroll locks and Blob downloads. Features retain content and security ownership. Architecture tests prevent new raw buttons/articles outside the primitives. See [shared UI helpers](../development/shared-ui.md).

Appearance adds `src/features/appearance/` for the 66-choice catalog, custom color schemas, shared contrast/token helpers, browser storage, nonce bootstrap and lazy native-dialog picker. Root layout composes its controller; navigation consumes callbacks. Tailwind utilities and feature CSS share color properties with Console-style defaults. Unit/browser tests cover palettes, custom light roles, cache/storage and accessibility. No API routes, Redis records, dependencies or migrations are added.

N100 adds `src/features/activity-views/` for named, bounded saved dashboard configurations and single-key Redis CAS. Thin entries are `/activity-views` and `/api/v2/activity-views`; portal/inbox/task pages resolve session-owned UUID selections, with capture controls and a shared activity banner. N099 adds a separate `views` export/erasure scope. Unit/API/browser and real Redis suites cover persistence, restoration, isolation, planning references, limits and erasure. No dependencies or database migrations are added.

N099 adds `src/features/personal-data/` for owned content summaries, bounded JSON export and separately confirmed erasure. Thin routes are `/personal-data` and `/api/v2/personal-data` (plus `/export` and `/delete`). Task/privacy stores retain persistence ownership and expose atomic empty-record revision fences; sharing deletion revokes the old link in the existing same-slot script. Focused unit/API/browser and real Redis integration suites cover exports, isolation, stale editors, races, revocation and corruption. No database migration or dependency is added.

N098 adds `src/features/monitoring/` for view-local freshness state, scoped source history and a shared accessible indicator. Inbox, item tools and command lookup compose it. The profile loader exposes cache capture time and inbox sources carry nullable read/context metadata. Focused unit/API/browser coverage verifies clock/cache/scope/outage behavior. No endpoints or persistence are added.

N097 adds `src/features/commands/` for the permission-filtered keyboard palette, global navigation composition and bounded fresh asset lookup. The thin API route is `/api/v2/commands/assets`; root layout composes the controller while shared navigation receives only callbacks. Unit/API/browser suites cover authorization, projection, cancellation, keyboard/mobile focus and CSP transitions. No persistence is added.

N096 adds server-rendered `quick-actions.tsx` and a responsive CSS module inside `src/features/portal/components/`. It reuses the existing Storage, Holdings and My Guild destinations through the centralized navigation resolver. Browser coverage is `tests/browser/quick-actions.spec.ts`; nested/permission-filtered lookup coverage stays with navigation unit tests. No routes or persistence are added.

N095 adds `src/features/privacy/` for private drafts, reviewed publication snapshots, member-only sharing, same-slot Redis link rotation and revocation. Thin routes are `/privacy`, `/sharing/[shareId]`, `/api/v2/privacy` and `/api/v2/privacy/shared/[shareId]`. Focused unit/API/browser and real Redis integration suites cover the contract; `tests/helpers/privacy-redis.mjs` is the disposable browser fixture.

N094 adds `src/features/tasks/` for private planning schemas, a member task editor, bounded Redis records and API handlers. Thin entries are `/tasks` and `/api/v2/tasks`. Context links reuse existing item/base/vehicle components; Storage accepts a bounded finder-prefill parameter without automatic scans. Dedicated task unit/API/browser and real Redis integration suites follow existing test organization.

N093 extends `src/features/inbox/` with notification schemas/policy, a settings editor and bounded private Redis controls. `/api/v2/inbox/preferences` delegates to its feature handlers. Unit/API/browser and real Redis integration suites cover the contract; `tests/helpers/notification-preferences-redis.mjs` is the disposable browser CAS model.

N092 adds `src/features/inbox/` for bounded read-through alert composition, API authorization and the member inbox. Thin entries are `/inbox` and `/api/v2/inbox`; focused unit/API/browser coverage follows the existing test organization. It adds no persistence or dependencies.

The directory map and root audit describe the current organization. Use `git ls-files` for the authoritative tracked file list; do not paste large asset listings or generated caches here. The [placement guide](file-organization.md) defines ownership. Earlier moves and verification remain in [migration history](migration-history.md). The [cleanup report](cleanup-report.md) records this follow-up.

Community season addition: `src/features/seasons/` owns contracts, server operations, member/admin components and styles. Thin routes live at workspace `seasons/`, `seasons/challenges/`, `seasons/history/` and V2 member/admin `seasons/` APIs. Domain tests live in `tests/unit/seasons/`, `tests/browser/seasons.spec.ts` and `tests/integration/redis-seasons.test.ts`. No existing files were migrated. See [community seasons](../features/community-seasons.md).

The season objective adaptation adds the browser-safe `seasons/catalog.ts`, original illustrated `components/objective-deck.tsx`, draft-only `components/catalog-tools.tsx` and server-only `server/observations.ts`. Existing season routes handle bounded level/journey verification. Category/catalog and evidence-security tests live beside the season suites; desktop/Safari/mobile flows extend the existing cross-browser suite. No dependency, persistent store, background worker or migration is added.

Automatic season management adds pure `seasons/generation.ts`, server-owned `server/generator.ts`, `components/generator-controls.tsx` and visibility-aware `components/automatic-progress.tsx`. Instrumentation starts a minute reconciler for the explicitly enabled Redis policy. Existing season APIs, CAS transactions and archive/claim operations handle publication and bulk verified progress. No external worker, environment variable or dependency is added. Tests extend the season unit, real Redis/Cluster and cross-browser suites. See [automatic seasons](../features/automatic-seasons.md).

Season finishing work adds `seasons/hooks/` for visibility-aware community polling, feature-owned artwork/live-presentation operations and thin upload/image/community API routes. `tests/browser/seasons-cross-browser.spec.ts` runs Chromium/Android and WebKit/Safari/iPhone projects; `tests/helpers/browser-tls.mjs` supplies an isolated HTTPS fixture without changing application security policy. Sharp, already used by Next.js, is explicitly pinned for raster normalization.

The intelligent season engine adds `seasons/engine/` (pure: rng, capability, kinds, assignment, themes, economy, rewards, simulation), `seasons/claim-view.ts`, `server/claims.ts`, `server/item-catalog.ts` and the admin `components/algorithm-monitor.tsx`. Tests live in `tests/unit/seasons/` (`personalization`, `rewards`, `claims`). No new dependency, environment variable or datastore is added. See [automatic seasons](../features/automatic-seasons.md).

Optional season game delivery lives in `features/seasons/server/deliveries.ts` and `delivery-gateway.ts`, with feature-owned reward configuration and delivery management components. The existing admin seasons API handles request/review/execute/recovery/reconciliation. Frozen claims authorize bounded Solaris/item grants; the independent default-off environment gate and administrator Console key protect execution. Versioned launch content lives in `features/seasons/content/`; `server/import.ts` and `scripts/maintenance/import-season.ts` provide validated, target-confirmed, idempotent draft imports through the season CAS operation. No new database or worker is introduced. Delivery and content regression tests live beside the existing season unit, integration and cross-browser suites.
N091 adds feature-owned portal layout contracts, a client widget editor around server-rendered panel slots, a CSS module and private single-key Redis persistence under `src/features/portal/`. The thin route is `src/app/api/v2/portal/layout/route.ts`. Focused coverage lives in portal unit/API/browser tests and `tests/integration/redis-portal-layout.test.ts`; the browser fixture model is `tests/helpers/portal-layout-redis.mjs`. The existing portal panels were extracted into `portal-panels.tsx` without moving data fetching into browser code.

## Clean architecture tree

All tracked configuration/source directories are shown. Asset trees stop at categories; binary files and generated output are omitted.

```text
./
.claude/
  rules/
.clinerules/
.codex/
.continue/
  rules/
.cursor/
  rules/
.github/
  instructions/
  workflows/
.roo/
  rules/
.windsurf/
  rules/
docs/
  administration/
  ai/
    guides/
    workflows/
  api/
  architecture/
  assets/
    screenshots/
  configuration/
  deployment/
  development/
  features/
  getting-started/
  installation/
  integrations/
  legal/
  reference/
  security/
  troubleshooting/
scripts/
  deployment/
  maintenance/
src/
  app/
    (workspace)/
      admin/
        changelog/
      bases/
        [id]/
        upload/
      character/
      events/
      guild/
      guilds/
      holdings/
        preview/
      map/
      market/
      portal/
      storage/
      status/
      vehicles/
    api/
      auth/
        [...nextauth]/
      v2/
        admin/
          audit/
          catalog/
          execute/
          events/
          overview/
          sessions/
          upload/
        auth/
          avatar/
            [userId]/
              [avatar]/
          password/
        bases/
          marketplace/
            [id]/
              image/
        changelog/
          announce/
        guilds/
          [guildId]/
            base-directory/
            onboarding/
            polls/
            noticeboard/
            operations/
            resource-requests/
        map/
          realtime/
    changelog/
    login/
    post-login/
    setup-password/
  assets/
    items/
    maps/
    models/
    share/
    terrain/
  components/
    brand/
    layout/
    navigation/
    ui/
  config/
  features/
    admin/
      components/
        changelog/
        screens/
      hooks/
      server/
    auth/
      components/
      server/
    bases/
      components/
        holdings/
        marketplace/
      marketplace/
        server/
        utils/
      server/
      styles/
      utils/
    bot/
      server/
    casino/
      audio/
      components/
      engine/
      fairness/
      games/
      ledger/
      server/
      transfers/
    changelog/
      server/
    chat/
      components/
      hooks/
      server/
    guilds/
      components/
      hooks/
      server/
    landing/
      components/
    map/
      components/
      hooks/
      server/
      styles/
      terrain/
        models/
        scene/
        surface/
      utils/
    market/
      components/
      server/
    player/
      server/
    portal/
      components/
      server/
    server-status/
      server/
    vehicles/
      components/
      server/
  lib/
    audio/
    cache/
    http/
    redis/
    security/
  pages/
    api/
      admin/
        guilds/
          [guildId]/
            applications/
              [applicationId]/
            messages/
      assets/
      base-marketplace/
      bases/
        [baseId]/
          export/
      guilds/
        [guildId]/
          applications/
            [applicationId]/
              messages/
          members/
            [playerId]/
          support/
      map/
      market/
        config/
        listings/
      player/
      portal/
        world/
      server/
        status/
      v1/
        bot/
  server/
    integrations/
      dunedocker/
  styles/
  types/
tests/
  api/
  architecture/
  browser/
  deployment/
  helpers/
  integration/
    helpers/
  load/
  production/
  unit/
    admin/
    auth/
    bases/
    changelog/
    components/
    config/
    deployment/
    docs/
    guilds/
    lib/
    maintenance/
    map/
    market/
    player/
    portal/
    release/
    runtime/
    security/
    server/
    vehicles/
```

## Root-file audit

| File                 | Purpose                                                   | Why it remains in the root                                                | Tooling status                 |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| .env                 | Local server secrets and environment values               | Dotenv discovers it in the working directory; ignored and never committed | Local runtime convention       |
| .env.example         | Documented environment template                           | The committed template belongs beside the local environment file          | Project convention             |
| .gitattributes       | Git line-ending and file attributes                       | Git reads it from the repository root                                     | Required by Git                |
| .gitignore           | Generated, secret, and dependency exclusions              | Git reads it from the repository root                                     | Required by Git                |
| .prettierignore      | Formatter exclusions                                      | Prettier discovers it in the working directory                            | Required by Prettier           |
| .prettierrc.json     | Shared formatting rules                                   | Prettier discovers it in the working directory                            | Required by Prettier           |
| AGENTS.md            | AI-agent architecture and engineering instructions        | Agent tools discover it from the repository root                          | Required agent entry point     |
| CHANGELOG.md         | Release notes consumed by CI and the application          | Release workflow and documentation expect it in the root                  | Required by release tooling    |
| CLAUDE.md            | Claude instruction entry point                            | Preserve native discovery                                                 | Agent tool convention          |
| GEMINI.md            | Gemini instruction entry point                            | Preserve native discovery                                                 | Agent tool convention          |
| CODEX.md             | Optional Codex companion                                  | Established explicit reference; not assumed automatically loaded          | Human convention               |
| KIMI.md              | Optional Kimi companion                                   | Established explicit reference; discovery depends on installed tool       | Human convention               |
| CODE_OF_CONDUCT.md   | Community behaviour policy                                | GitHub discovers community files in the root                              | GitHub community standard      |
| CONTRIBUTING.md      | Contribution guide                                        | GitHub discovers community files in the root                              | GitHub community standard      |
| LICENSE              | Project license                                           | License and source distribution convention                                | Required project documentation |
| NOTICE.md            | Third-party attribution and project notices               | Legal notices accompany the license in the root                           | Required project documentation |
| README.md            | Primary setup, deployment, and operations guide           | GitHub and developers discover it in the root                             | Required project documentation |
| SECURITY.md          | Vulnerability disclosure policy                           | GitHub discovers the security policy in the root                          | GitHub community standard      |
| eslint.config.mjs    | ESLint flat configuration                                 | ESLint discovers it in the working directory                              | Required by ESLint             |
| next-env.d.ts        | Next.js and generated route type references               | Next.js maintains this declaration at the project root                    | Required by Next.js            |
| next.config.ts       | Next.js runtime, rewrite, and tracing configuration       | Next.js discovers it in the working directory                             | Required by Next.js            |
| package-lock.json    | Reproducible npm dependency lock                          | npm requires it beside package.json                                       | Required by npm                |
| package.json         | Package metadata, dependencies, and verification commands | npm requires it in the project root                                       | Required by npm                |
| playwright.config.ts | Browser suite and fixture-server configuration            | Playwright discovers it in the working directory                          | Required by Playwright         |
| postcss.config.mjs   | Tailwind/PostCSS integration                              | PostCSS discovers it in the working directory                             | Required by PostCSS            |
| tailwind.config.ts   | Dune design tokens and Tailwind configuration             | The global stylesheet references it from the root                         | Required by the Tailwind setup |
| tsconfig.json        | TypeScript compiler and Next.js plugin configuration      | TypeScript and Next.js discover it in the working directory               | Required by TypeScript         |
| tsconfig.tsbuildinfo | Incremental TypeScript cache                              | Generated locally, ignored, and excluded from source checks               | Generated; not source          |
| vitest.config.mjs    | Unit/API test discovery and coverage configuration        | Vitest discovers it in the working directory                              | Required by Vitest             |

## Feature ownership

| Feature                       | Responsibility                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/admin/`         | Authorized administration catalog, screens, hooks, provider execution, uploads, and guild oversight                                                                                                                 |
| `src/features/auth/`          | Discord/credentials sign-in, accounts, password sealing, session persistence, freshness, authorization, and bounded Redis-backed Discord avatar images                                                              |
| `src/features/bases/`         | Blueprint import/export, holdings, previews, storage UI, schemas, and base marketplace                                                                                                                              |
| `src/features/bot/`           | Token-authorized read-only world service API                                                                                                                                                                        |
| `src/features/casino/`        | The Solaris Exchange: Redis Solaris wallet ledger, offline-only Console transfers with reconciliation, provably fair randomness, round engine, six game modules, casino API service, and UI                         |
| `src/features/changelog/`     | Searchable release journal, complete multipart Discord V2 messages, tracked series updates and cleanup                                                                                                              |
| `src/features/chat/`          | Bot-compatible game chat, shared inline/path TLS validation, Chat Bridge worker, Redis history/live distribution, SSE gateway, and chat UI                                                                          |
| `src/features/events/`        | Community events, one-time seed, bounded Redis persistence, draft/revision checks and automatic Discord V2 announcements                                                                                            |
| `src/features/guilds/`        | Directory, recruitment, applications, roster, membership, private noticeboard, operations planner, resource requests, shared base directory, recruit onboarding, guild polls, support, receipts, and question forms |
| `src/features/landing/`       | Public landing page: `content.ts` (all copy and links), page composition, layout illustrations                                                                                                                      |
| `src/features/map/`           | 2D/3D terrain, markers, models, realtime data, and map interaction                                                                                                                                                  |
| `src/features/market/`        | Market normalization, presentation, listings, configuration, and player listings                                                                                                                                    |
| `src/features/player/`        | Linked-player identity, character/profile data, inventory, storage, and item imagery                                                                                                                                |
| `src/features/portal/`        | Signed-in overview, world briefing, population, telemetry, and portal view models                                                                                                                                   |
| `src/features/server-status/` | Read-only server status handler and authenticated HetrixTools hosting report                                                                                                                                        |
| `src/features/vehicles/`      | Vehicle normalization, presentation, access UI, and server loading                                                                                                                                                  |

## Reproducing the inventory

`scripts/chat-bridge-supervisor.mjs` owns automatic child startup, bounded restarts, and shutdown for the existing launcher. Shared RabbitMQ TLS validation stays in `src/features/chat/server/tls.ts`; disposable TLS test material is generated by `tests/helpers/tls-certificates.ts`, and `tests/production/chat-startup.mjs` verifies the launcher against local fixtures.

Run `git ls-files` to include tracked source and native dot-directory configuration. Exclude generated directories and summarize `src/assets/` by category. Inspect `git status --short` separately for pending additions, moves, or deletions. Do not describe untracked files as tracked.

## Audio presentation ownership

`src/lib/audio/` owns the shared browser playback manager, synthesized effects, optional bundled voice recordings, preferences validation, and notification feedback hook. `src/components/ui/audio-controls.tsx` owns the single topbar settings panel and delegated interaction listeners. Casino cards, chips, table illustrations, and deterministic public-view narration remain in `src/features/casino/components/`. No ledger, game mathematics, transfer rules, or activation safeguards change.

The default local dealer recordings and manifest live in `src/assets/audio/casino/solaris-v1/`. `src/features/casino/audio/voice-pack.ts` turns confirmed narration into allowlisted clip sequences; shared playback stays in `src/lib/audio/`. `scripts/maintenance/build-casino-voice-pack.mjs` is an offline authoring tool, not a build or runtime dependency. Asset delivery preserves same-origin fetching and the existing restrictive CSP.

## Self-hosted interface fonts

`src/assets/fonts/` owns the real Archivo and JetBrains Mono variable TTFs and their SIL OFL licenses. `src/app/layout.tsx` loads them with `next/font/local`, retaining both CSS variables, variable weights, Archivo width and swap display. [Font provenance](../legal/font-provenance.md) records the pinned upstream revision and checksums. No build-time font network access is required.
