# Project structure

The authoritative placement rules are in [file organization](../architecture/file-organization.md) and the full directory map in the
[repository inventory](../architecture/repository-inventory.md). This is the short version.

| Path                         | Contents                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/app/`                   | Routing and framework entry points only. `(workspace)/` pages call `requireSession()` themselves. `api/v2/**` uses `server/http.ts` |
| `src/pages/api/`             | Thin legacy API files delegating to `runPagesApiHandler`                                             |
| `src/features/<domain>/`     | All business code: `admin`, `auth`, `bases`, `bot`, `changelog`, `guilds`, `landing`, `map`, `market`, `player`, `portal`, `server-status`, `vehicles` |
| `src/components/`            | Shared UI only: `navigation/` (the single global topbar and route inventory), `brand/`, `layout/`, `ui/` |
| `src/server/`                | Shared request infrastructure: `http.ts`, `pages-api.ts`, `api-read-cache.ts`, `cookies.ts`, `read-budget.ts`, `integrations/` |
| `src/lib/`                   | `redis/`, `security/`, `cache/`, `http/`, formatting, logging, errors (server-only: `redis`, `security`) |
| `src/config/env.ts`          | The one environment schema and production gate                                                       |
| `src/instrumentation.ts`     | Startup validation, Console warm-up, population recorder, announcements                               |
| `src/proxy.ts`               | Per-request CSP and security headers                                                                  |
| `src/assets/`                | Favicon, images, terrain/model bundles (large; not enumerated in normal work)                          |
| `scripts/`                   | `server-launcher.mjs`; `maintenance/` (re-key tools, model generation, AI config validation, `check-docs.mjs`); `deployment/` (egg builder) |
| `tests/`                     | `api`, `architecture`, `browser`, `deployment`, `helpers`, `production`, `integration`, `load`, `unit/<domain>`      |
| `docs/`                      | This documentation set, `architecture/`, `ai/`, `legal/`, `assets/`                                    |
| `.github/`                   | `workflows/ci.yml`, `workflows/release.yml`, `dependabot.yml`                                          |

Rules of thumb: feature code stays in its feature; do not add root files, a `public/` directory, PostgreSQL configuration,
`src/modules/` or `src/infrastructure/`; keep `package.json` and `package-lock.json` versions synchronized when releasing.
