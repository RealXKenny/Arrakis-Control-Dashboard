# Repository inventory

The directory map and root audit describe the current organization. Use `git ls-files` for the authoritative tracked file list; do not paste large asset listings or generated caches here. The [placement guide](file-organization.md) defines ownership. Earlier moves and verification remain in [migration history](migration-history.md). The [cleanup report](cleanup-report.md) records this follow-up.

Community season addition: `src/features/seasons/` owns contracts, server operations, member/admin components and styles. Thin routes live at workspace `seasons/`, `seasons/challenges/`, `seasons/history/` and V2 member/admin `seasons/` APIs. Domain tests live in `tests/unit/seasons/`, `tests/browser/seasons.spec.ts` and `tests/integration/redis-seasons.test.ts`. No existing files were migrated. See [community seasons](../features/community-seasons.md).

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
