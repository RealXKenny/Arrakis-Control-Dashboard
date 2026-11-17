# Repository cleanup report

## Baseline and scope

The November 8, 2026 cleanup started from clean branch `v2` at `0e87b6b`. The existing feature architecture was retained. Git status, branch, latest commit, and the complete tracked list were inspected before edits. There were no pre-existing working-tree changes. Implementation and validation performed no push, release, dependency upgrade, credential edit, production Redis migration, or production data operation. The user subsequently authorized the local cleanup commit on v2.

## Implemented changes

- Removed the generic root assistant-installation guide and consolidated setup under docs/ai. Kept all native assistant discovery paths.
- Replaced repeated adapter policy bodies with explicit instructions to read AGENTS.md and the canonical guides; preserved Cursor, Continue, and Copilot frontmatter.
- Moved profile-loading failure presentation from shared UI to portal, which owns PortalResult. Updated all six consumers. The component behavior is unchanged.
- Grouped the production smoke suite under tests/production and preserved the npm entry point and local fake-service fixtures. Existing maintenance/deployment script placement was already appropriate.
- Removed three verified unused source/style modules after static/dynamic reference, tooling, configuration, route, test, and history checks.
- Replaced the large stale filename dump with a concise directory inventory, root audit, and reproducible Git instructions. Preserved the previous migration's 254 moves, removal rationale, results, and remaining risks in a separate historical record.
- Added source-owner and shared-UI boundary enforcement. Browser graph checks now start at App Router use-client modules, omit erased type imports, and respect file-level use-server references. Existing cycle, naming, API, and root checks remain enabled.
- Added npm run ai:check, expanded static adapter validation and CI path triggers to all maintained native adapters, and made docs:check a required CI matrix task. Updated its regression assertion.

## Before and after / migration report

| Responsibility               | Previous path or structure                       | Current home                                                                                  |
| ---------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Assistant setup              | INSTALL.md and docs/ai/INSTALL.md                | docs/ai/installation.md (merged and rewritten for the actual repository)                      |
| Codex/Kimi companion copies  | docs/ai/guides/CODEX.md and KIMI.md              | Existing root CODEX.md and KIMI.md, linked from the guide index                               |
| Assistant catalog            | docs/ai/AI-AGENTS.md plus docs/ai/README.md      | docs/ai/README.md                                                                             |
| Profile failure UI           | src/components/feedback/gauge-notice.tsx         | src/features/portal/components/profile-failure.tsx                                            |
| Built-runtime smoke          | tests/smoke-production.mjs                       | tests/production/smoke.mjs                                                                    |
| Historical migration content | Mixed into repository-inventory.md               | docs/architecture/migration-history.md                                                        |
| Current inventory            | Directory map plus thousands of static filenames | docs/architecture/repository-inventory.md: current directories, root audit, feature ownership |

Filesystem moves were used without staging Git metadata. Review them as moves/consolidations even where unstaged Git status shows delete/add pairs. The removed shared feedback directory was empty after its only component moved. No other empty categories were introduced.

## Tracked deletions and evidence

| Removed file                                  | Reason and preserved replacement                                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INSTALL.md                                    | Consolidated into docs/ai/installation.md; no tool-discovery requirement or active references                                                                   |
| docs/ai/INSTALL.md                            | Duplicate archive-oriented instructions consolidated into the same setup guide                                                                                  |
| docs/ai/AI-AGENTS.md                          | Duplicate assistant catalog merged into docs/ai/README.md; stale screenshot/archive claims removed                                                              |
| docs/ai/guides/CODEX.md                       | Exact duplicate of retained root CODEX.md; guide index now links there                                                                                          |
| docs/ai/guides/KIMI.md                        | Exact duplicate of retained root KIMI.md; guide index now links there                                                                                           |
| src/components/feedback/gauge-notice.tsx      | Moved intact except relative imports; portal now owns the component                                                                                             |
| tests/smoke-production.mjs                    | Moved with fixture/launcher imports adjusted; npm command and documentation updated                                                                             |
| src/features/bases/components/base-import.tsx | No incoming static/dynamic imports, runtime discovery, route, tooling, or deployment references. The reachable upload form and marketplace import button remain |
| src/features/bases/styles/import.module.css   | Referenced only by the unreachable BaseImport component; removed with it                                                                                        |
| src/config/version.ts                         | APP_VERSION had no consumers; ordinary module with no framework discovery requirement. Package/release version metadata is unchanged                            |

The obsolete static filename listing was removed from Markdown, not from the tracked asset tree. No historical security record or bundled asset was deleted.

## Root audit, documentation, and final tree

The [current inventory](repository-inventory.md#root-file-audit) lists every retained root file and its discovery or conventional purpose. There are 27 retained tracked root files, including optional CODEX.md and KIMI.md references for existing explicit workflows. Ignored local .env and TypeScript cache files are documented separately and remain uncommitted.

The [complete directory tree](repository-inventory.md#clean-architecture-tree) includes meaningful tracked source, tests, scripts, documentation, and native configuration directories. Asset subtrees stop at categories; generated output and individual binary files are excluded. Use git ls-files for a complete tracked list and git status for pending additions/deletions.

Documentation keeps its established audience categories: getting-started, installation, configuration, features, integrations, administration, security, api, development, deployment, troubleshooting, reference, architecture, ai, legal, and assets. Operational guidance remains in administration; testing guidance remains in development/testing.md. No competing operations/testing section or publishing infrastructure was added. The root was reduced from 28 to 27 tracked files. README.md links to the permanent documentation center and assistant setup. Placement rules now explain root policy, removal checks, exceptions, new-directory discipline, script/test ownership, and import boundaries.

## AI compatibility

Claude, Codex, Gemini, Kimi, Copilot, Cursor, Cline, Continue, Roo, and Windsurf native configuration paths are retained. No model identifiers, permission settings, or import syntax were added. Six repeated shared-contract adapters now explicitly direct the assistant to canonical guidance. The Claude architecture rule was updated to the new component home. Root CODEX.md and KIMI.md remain optional references; actual instruction discovery must be verified in the installed tool. The Aider guide remains an explicit --read reference.

AI validation checks required files, canonical references, JSON, managed-block markers, known frontmatter fields, nonempty top-level AI guides, and retired directories. All tracked YAML was additionally parsed with the existing js-yaml dependency. It does not emulate tool loaders or fully validate TOML/assistant settings against installed product schemas. The Codex TOML and Claude settings are unchanged.

## Source architecture

All 13 existing feature owners remain authoritative; the [feature table](repository-inventory.md#feature-ownership) records their responsibilities. The source dependency scan found only two zero-incoming ordinary modules: the removed BaseImport and version export. Their associated stylesheet was also verified unused. No broad unused-export deletion was attempted.

Shared navigation's auth identity/actions are an explicit composition exception. Shared request infrastructure's session orchestration and Redis data-provider population calculations are existing documented composition points; they were retained to avoid an unrelated architectural rewrite. No authentication, API, Redis-key, caching, authorization, or UI contract was changed.

## Validation results

| Command                                                                                                                                           | Result                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| npm run format:check                                                                                                                              | Passed                                                                                                       |
| npm run typecheck                                                                                                                                 | Passed                                                                                                       |
| npm run lint                                                                                                                                      | Passed, zero warnings                                                                                        |
| npm run docs:check                                                                                                                                | Passed; final report links rechecked after completion                                                        |
| npm run ai:check                                                                                                                                  | Passed                                                                                                       |
| npm test -- --reporter=json --outputFile=test-results/cleanup-unit-final.json                                                                     | Passed: 1,014 tests; 32 skipped; 104 test files, no failures                                                 |
| npm run build                                                                                                                                     | Passed outside sandbox; initial sandbox attempt failed to canonicalize the workspace path with Access denied |
| npm run test:production                                                                                                                           | Passed: built runtime, 13 API modules, protected base import, telemetry, market, logout                      |
| npm run test:integration (standalone, explicit loopback TEST_REDIS_URL)                                                                           | Passed: 91 tests; four cluster-only tests skipped as expected                                                |
| npm run test:integration (six-node cluster, explicit loopback TEST_REDIS_CLUSTER_NODES)                                                           | Passed: all 95 tests, zero skipped; includes failover under live traffic                                     |
| npm run test:browser -- --reporter=json                                                                                                           | Passed: 81 tests, zero failures/skips, about 3 minutes 44 seconds                                            |
| npm test -- --reporter=dot tests/architecture/architecture.test.ts tests/unit/docs/documentation.test.ts tests/unit/release/release-notes.test.ts | Passed: 22 focused checks after final boundary refinements                                                   |
| Tracked YAML parsing with js-yaml                                                                                                                 | Passed                                                                                                       |
| git diff --check                                                                                                                                  | Passed; final review repeated after documentation completion                                                 |

The initial sandboxed unit run had three failures across Redis fixture connections and Windows junction creation. Re-running outside the sandbox resolved them without modifying those tests or application code. Intermediate missing-report/documentation and CI-matrix assertion failures were corrected before the passing final unit run. Historical browser counts in migration-history.md are explicitly historical, not evidence of the current baseline.

## Remaining limits and final safety review

Real disposable standalone Redis and Redis Cluster integration were exercised successfully in the follow-up below. Live Discord/Dune Console, deployed Pterodactyl, and installed assistant loading were not exercised. Unit tests, smoke, and browser tests use local fixtures. No claim of full production validation is made. Source analysis confirms references for removed modules; it is not a proof that every exported symbol in the repository is necessary.

Final review checks changed-file scope, move contents, whitespace, ignored generated artifacts, root ownership, and preservation of the managed Next.js block. Package and lockfile versions remain 2.0.0; no release was requested. This report accompanies the user-authorized local cleanup commit on v2. Generated test infrastructure remains ignored; no push or release is included.

## Disposable Redis integration follow-up — November 8, 2026

The previous integration gap is closed. Neither Docker nor a working WSL installation was available, so the tests used the portable [redis-windows Redis 7.4.9 Cygwin build](https://github.com/redis-windows/redis-windows/releases/tag/7.4.9). The archive's SHA-256 matched both GitHub release asset metadata and the published release checksum:

`da0a1b42b683607d80937048c568b6b483683cf24c130fcded06ac99f3f3c7e9`

No software service was installed. Downloaded binaries, per-instance state, server logs, and the one-off orchestration script were confined to ignored `test-results/redis-disposable-20261108/`. Before launching, the runner verified all selected client and cluster-bus ports were unused. It started only its own seven processes with loopback binding, protected mode enabled, snapshot scheduling disabled, and AOF disabled.

| Target        | Isolated endpoints                           | Result                                                            |
| ------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Standalone    | 127.0.0.1:16391, database 15                 | 91 passed, 4 cluster-only tests skipped, 0 failed; six test files |
| Redis Cluster | 127.0.0.1:17001–17006; bus ports 27001–27006 | 95 passed, 0 skipped, 0 failed; six test files                    |

The cluster had three masters, three connected replicas, and all 16,384 slots covered before testing. All four cluster-specific tests passed, including slot placement, distributed single-key traffic, and manual marketplace-shard failover under live publish/delete traffic with counter-consistency assertions. The other 91 tests exercised guilds/applications, support conversations, marketplace Lua operations, the marketplace rekey CLI, sessions, account claims, rate limits, and audit records against both topologies. No regressions were observed, so no application or test changes were needed.

The runner invoked the existing npm script twice with process-local target overrides and JSON reporting. Equivalent PowerShell invocations, while these disposable instances are running, are:

```powershell
# Standalone run: TEST_REDIS_CLUSTER_NODES and REDIS_CLUSTER_NODES are unset.
$env:TEST_REDIS_URL = 'redis://127.0.0.1:16391/15'
$env:REDIS_URL = $env:TEST_REDIS_URL
npm run test:integration -- --reporter=json --outputFile=test-results/redis-disposable-20261108/standalone-results.json

# Cluster run: TEST_REDIS_URL is unset.
$env:TEST_REDIS_CLUSTER_NODES = '127.0.0.1:17001,127.0.0.1:17002,127.0.0.1:17003'
$env:REDIS_CLUSTER_NODES = $env:TEST_REDIS_CLUSTER_NODES
$env:REDIS_URL = 'redis://127.0.0.1:17001'
npm run test:integration -- --reporter=json --outputFile=test-results/redis-disposable-20261108/cluster-results.json
```

These commands describe the completed runs; the instances are now stopped. The orchestration used isolated child environments rather than changing the user's persistent environment or editing .env. Every destructive test flush and rekey targeted these newly created local instances. Production addresses, credentials, and data were not used.

Teardown stopped only the processes created by this runner. A subsequent connection check confirmed all seven Redis client ports and all six cluster-bus ports were closed. Ignored logs and JSON results remain available for review; no running Redis instance, Windows service, persistent environment change, tracked binary, or dependency change remains. The native Windows build differs from CI's Linux/Alpine Redis runtime; this run does not replace validation on deployed infrastructure.
