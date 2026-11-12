# Commands

## npm scripts (`package.json`)

| Command                                   | Purpose                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `npm ci`                                  | Install exactly the locked dependencies                                          |
| `npm run dev`                             | Development server (`node scripts/server-launcher.mjs dev`)                      |
| `npm run build`                           | Production build (`next build`)                                                  |
| `npm start`                               | Production server (`node scripts/server-launcher.mjs start`)                     |
| `npm run chat:bridge`                     | Standalone diagnostic consumer; never run beside the automatic worker            |
| `npm run lint`                            | ESLint, zero warnings allowed                                                    |
| `npm run typecheck`                       | `tsc --noEmit`                                                                   |
| `npm test`                                | Vitest unit/API/architecture/deployment tests                                    |
| `npm run test:watch`                      | Vitest watch mode                                                                |
| `npm run test:coverage`                   | Vitest with V8 coverage                                                          |
| `npm run test:integration`                | Real-Redis suites (`TEST_REDIS_URL` or `TEST_REDIS_CLUSTER_NODES`)               |
| `npm run test:production`                 | Production smoke test (after build)                                              |
| `npm run test:browser`                    | Playwright (Chromium)                                                            |
| `npm run format` / `npm run format:check` | Prettier write / check on `src tests scripts`                                    |
| `npm run docs:format:check`               | Check Prettier formatting for changed files under `docs/`                        |
| `npm run ai:check`                        | Validate native assistant files and instruction frontmatter                      |
| `npm run docs:check`                      | Validate Markdown links and anchors                                              |
| `npm run workflows:check`                 | Validate workflow and Dependabot YAML, pins, and the required CI gate            |
| `npm run redis:rekey`                     | Rename legacy keys to hash-tagged names (`--apply` to write)                     |
| `npm run marketplace:rekey`               | Marketplace owner-key migration (`--apply --backup <file>`, `--rollback <file>`) |
| `npm run seasons:import`                  | Validate/import a season draft (dry run; `--apply --target <target>` to write)   |

## Scripts that are not npm scripts

| Command                                                   | Purpose                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `node scripts/deployment/build-pterodactyl-egg.mjs [out]` | Generate the Pterodactyl egg JSON (used by the release workflow) |
| `node scripts/maintenance/validate-ai-config.mjs`         | Validate the coding-agent configuration files                    |
| `node scripts/maintenance/build-client-models.mjs`        | Offline client model generation (needs an extracted bundle)      |

## Useful checks

| Platform   | Command                                                                                 | Expect                |
| ---------- | --------------------------------------------------------------------------------------- | --------------------- |
| bash       | `curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2008/`                      | `200`                 |
| bash       | `curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2008/api/v2/admin/overview` | `401` signed out      |
| bash       | `redis-cli -u "$REDIS_URL" ping`                                                        | `PONG`                |
| bash       | `sha256sum --check arrakis-control-dashboard-<version>.tar.gz.sha256`                   | `OK`                  |
| PowerShell | `(Invoke-WebRequest http://127.0.0.1:2008/ -UseBasicParsing).StatusCode`                | `200`                 |
| PowerShell | `(Get-FileHash <archive> -Algorithm SHA256).Hash`                                       | matches the `.sha256` |

## RedBlink `dune` CLI (upstream, not part of this repository)

Documented in RedBlink's system overview: `dune status`, `dune ps`, `dune servers`, `dune ports`, `dune update` (`check`, `install`, `install-assets`, `fix-steamcmd`,
`auto enable|disable|status`), `dune self-update` (`check`, `list`, `install [latest|<tag>]`), `dune console reload`, `dune db backup-system` / `restore-system`.
Use upstream's documentation for flags and behaviour ([RedBlink integration](../integrations/redblink-dune-docker.md)).
