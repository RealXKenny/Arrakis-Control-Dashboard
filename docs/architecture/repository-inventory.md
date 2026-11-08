# Repository inventory

The directory map and root audit describe the current organization. Use `git ls-files` for the authoritative tracked file list; do not paste large asset listings or generated caches here. The [placement guide](file-organization.md) defines ownership. Earlier moves and verification remain in [migration history](migration-history.md). The [cleanup report](cleanup-report.md) records this follow-up.

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
      guild/
      guilds/
      holdings/
        preview/
      map/
      market/
      portal/
      storage/
      vehicles/
    api/
      auth/
        [...nextauth]/
      v2/
        admin/
          audit/
          catalog/
          execute/
          overview/
          sessions/
          upload/
        auth/
          password/
        bases/
          marketplace/
            [id]/
              image/
        changelog/
          announce/
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
    changelog/
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

| Feature                       | Responsibility                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/features/admin/`         | Authorized administration catalog, screens, hooks, provider execution, uploads, and guild oversight        |
| `src/features/auth/`          | Discord/credentials sign-in, accounts, password sealing, session persistence, freshness, and authorization |
| `src/features/bases/`         | Blueprint import/export, holdings, previews, storage UI, schemas, and base marketplace                     |
| `src/features/bot/`           | Token-authorized read-only world service API                                                               |
| `src/features/changelog/`     | Release reading, Discord presentation, and announcement services                                           |
| `src/features/guilds/`        | Directory, recruitment, applications, roster, membership, support, receipts, and question forms            |
| `src/features/landing/`       | Public landing-page presentation                                                                           |
| `src/features/map/`           | 2D/3D terrain, markers, models, realtime data, and map interaction                                         |
| `src/features/market/`        | Market normalization, presentation, listings, configuration, and player listings                           |
| `src/features/player/`        | Linked-player identity, character/profile data, inventory, storage, and item imagery                       |
| `src/features/portal/`        | Signed-in overview, world briefing, population, telemetry, and portal view models                          |
| `src/features/server-status/` | Read-only server status handler                                                                            |
| `src/features/vehicles/`      | Vehicle normalization, presentation, access UI, and server loading                                         |

## Reproducing the inventory

Run `git ls-files` to include tracked source and native dot-directory configuration. Exclude generated directories and summarize `src/assets/` by category. Inspect `git status --short` separately for pending additions, moves, or deletions. Do not describe untracked files as tracked.
