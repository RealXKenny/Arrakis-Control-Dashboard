# Development workflow

## Setup

[Local development](../installation/local-development.md) (`npm ci`, `.env`, `npm run dev` on `http://127.0.0.1:2008`).

## Scripts (`package.json`)

| Command                          | What it does                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`                    | `node scripts/server-launcher.mjs dev`                                                |
| `npm run build`                  | `next build`                                                                          |
| `npm start`                      | `node scripts/server-launcher.mjs start` (production server)                           |
| `npm run lint`                   | `eslint . --max-warnings 0`                                                           |
| `npm run typecheck`              | `tsc --noEmit`                                                                        |
| `npm test`                       | `vitest run` (unit, API, architecture, deployment; integration excluded unless a test Redis is configured) |
| `npm run test:watch`             | `vitest`                                                                              |
| `npm run test:coverage`          | `vitest run --coverage`                                                               |
| `npm run test:integration`       | `vitest run tests/integration --no-file-parallelism` (needs `TEST_REDIS_URL` or `TEST_REDIS_CLUSTER_NODES`) |
| `npm run test:production`        | `node tests/smoke-production.mjs` (after `npm run build`)                              |
| `npm run test:browser`           | `playwright test`                                                                      |
| `npm run format` / `format:check` | Prettier on `src tests scripts` (write / check)                                       |
| `npm run docs:check`             | Validate relative links and anchors in Markdown                                        |
| `npm run redis:rekey`            | Legacy key renaming for hash tags                                                      |
| `npm run marketplace:rekey`      | Marketplace owner-key migration                                                        |

## Conventions

- Prefer feature-module changes; keep page entry points thin; add the smallest focused regression test.
- Normalize external payloads from `unknown`; never return raw errors, credentials or unbounded data. Keep unsafe-size numbers as strings.
- Changing environment: update `src/config/env.ts`, `.env.example`, tests and the README together.
- Do not add a database, `public/`, Sentry or log files. Do not edit the Next.js-managed block in `AGENTS.md`.
- Format only files you changed (`npx prettier --write <files>`); `format:check` covers the repository.
- Never commit `.next/`, `coverage/`, `test-results/`, `playwright-report/`, `tsconfig.tsbuildinfo` or `.env`.

## Before a pull request

```bash
npm run format:check && npm run typecheck && npm run lint && npm test
npm run docs:check              # when you touched documentation
npm run build && npm run test:production   # for runtime, routing, environment or infrastructure changes
npm run test:browser            # for UI behaviour
npm run test:integration        # for Redis scripts, session storage or migration code (needs a disposable Redis)
```

## Releases

Bump the stable SemVer in `package.json` and `package-lock.json`, and add `## Patch Notes vX.Y.Z` to `CHANGELOG.md` (sections: New Features,
Improvements, Fixes, Security, Privacy, Removed, Upgrade Notes, Community Contributions; omit empty ones). Successful `main` CI creates the tag, the GitHub
Release, the checksummed archive and the egg ([production release](../deployment/production-release.md)).

## Pull requests

Follow [CONTRIBUTING.md](../../CONTRIBUTING.md). Describe behaviour changes, security impact, tests run and tests not run. Keep unrelated changes out.
