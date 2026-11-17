# Expansion backlog checkpoint

Roadmap: [draft PR #8](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/8), N001–N100. Preserve the complete PR backlog and release history. Work one feature at a time on `v2`; do not merge or release.

## Completed: N001 universal item finder

Implemented and locally verified in `9aa370a16de17f9e2316c2406f40bde3d7eb7f0a`, published to `v2` through the verified RealXKenny connection. All required hosted checks passed; N001 is checked in PR #8. The [completion evidence comment](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/8#issuecomment-6786796215) was verified as authored by RealXKenny. N002–N100 remain unchecked.

- Storage searches the fresh linked character's inventory, roster-verified bases/vehicles and independently authorized base containers. Exact reported inventory/slot IDs, grade/durability/augments, quantity strings, source timestamps and useful workspace links are included.
- No game guild is required. Caller IDs, names and list filters never authorize reads. Missing canonical controller membership or child access fails closed. No game writes or production credentials/services are used.
- Three workers, six member searches/minute, shared admission budget, provider/overall deadlines, request cancellation and bounded assets/containers/stacks/matches constrain searches. Source errors and exclusions remain visible.
- Authorized build prerequisite: real Archivo and JetBrains Mono fonts now use `next/font/local` with pinned binaries and OFL licenses. See [font provenance](../legal/font-provenance.md). No font mock or Google Fonts access is needed.
- Upstream Console capability/field review: RedBlink `dune-awakening-selfhost-docker` revision `6ddd11d6b165652ddb7ec74380977ce7a4fe67c0`, current API reference, slot response types and roster/child-access implementation. Player inventory augment IDs are preserved as IDs; missing quality is not invented.

## Validation recorded so far

- Node `v24.22.1`, npm `11.9.0`; locked dependencies installed with `npm ci --ignore-scripts`.
- Focused unit/API/transport: 23 tests passed, covering three sources, solo access, canonical identity, per-container denial, uncertain/unsupported data, exact strings, bounded work, cancellation, member throttling and anonymous/caller-ID rejection.
- Final full unit/API/architecture suite: 166 files / 1,651 tests passed in a fixture-only process environment; formatting, typecheck and lint passed.
- Original untouched `0a41bdf` baseline: the previously affected guild, marketplace HMAC and dashboard provider suites pass (3 files / 31 tests) in the same fixture-only environment. Initial inherited deployment settings produced 47 failures, including localhost-origin/HMAC conflicts; production security and test assertions were not weakened.
- Final production build without font mock passed. Both final production smoke suites passed (runtime API and automatic chat startup; disposable local fixtures only).
- System Chromium `156.0.8078.79`: direct Playwright headless launch/render passed; 43 expanded production browser tests passed (N001, fonts, navigation, workspace, viewport and WCAG checks). After final source hardening, all four focused tests passed again, including exact base-card navigation, real local fonts/Archivo width, 320px layout, empty/error/cancel behavior and the no-guild three-source search.
- Disposable real standalone Redis: 161 tests passed; four Cluster-only cases skipped locally. Hosted real six-node Cluster: all 165 tests passed, including live failover. No new storage script was introduced.
- Documentation links (153 Markdown files) and changed Markdown checks passed; final checkpoint formatting/link checks are rerun before publication.

## Environment and publishing

The allowed policy denies `cdn.playwright.dev` and Google Fonts. Use installed `/usr/bin/chromium` through a cloud-local temporary Playwright config preserving the repository projects/fixture server and setting its `cwd` to the repository. Do not change CI defaults or browser cache binaries. Fonts are now permanently local.

Test processes must remove inherited deployment variables listed in `.env.example` before spawning fixtures; preserve PATH and the supplied proxy/CA environment. Do not print secret values. The local `/tmp/arrakis-clean-env.cjs` wrapper performs this cleanup and removes font mock variables. The local `/tmp/arrakis-playwright.config.ts` imports the repository config and uses system Chromium; neither belongs in Git.

Cloud connector profile verified as RealXKenny (Kenny Cline, `realxkenny@gmail.com`). Repository-local Git identity matches. The published commit was verified from Git objects: author and committer are both Kenny Cline <realxkenny@gmail.com>; GitHub attributes both to RealXKenny. Shell `gh api user` is denied by policy and is not a verified publishing identity. Publish only through the verified user connection and verify resulting commit author/committer and comment actor. Keep PR #8 draft. No bot, co-author or generated-by attribution.

## Hosted runs and next action

- [CI](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/42957037226)
- [Redis Cluster](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/42957037298)
- [CodeQL](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/42957043305)

All 14 CI jobs, including all four browser shards and CI / Required Checks, passed on the feature commit. Both CodeQL analyses and the separate real Cluster job passed. PR #8 remains draft.

## Completed: N002 pinned item counters

Published and fully verified in `d4ed2969a116d24ad4f7ea1758d971eb2bc0a4d4`. N002 is checked in PR #8; its [completion evidence comment](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/8#issuecomment-6787442881) was verified as authored by RealXKenny. The published commit's Git author/committer were asserted as Kenny Cline <realxkenny@gmail.com> before branch publication; GitHub attributes both to RealXKenny.

- Storage now pins up to 12 templates from real finder results and refreshes exact all-grade counters. Preferences are private to the verified account and exact linked pawn/controller pair, with 8 KiB Redis records, UUID CAS and 90-day inactivity expiry. No counts/snapshots or game writes are persisted.
- The shared collector preserves the public finder’s 200-match cap; pinned readings can aggregate up to 5,000 matching stacks without exposing raw rows. Per-source permissions, timeouts/cancellation, character-pair change guards, repeated/missing item identity and unknown/oversized quantities remain explicit. Partial coverage never becomes a complete zero.
- Final local standard checks: formatting, lint, types, **168 unit/API/architecture files / 1,667 tests** passed. Documentation links/changed Markdown, normal production build and both production smoke suites passed.
- Browser: **46 expanded cases** passed (pins/finder/fonts, navigation, workspace, viewport and WCAG). All **seven focused cases** passed again on the final build, including replacement-pawn privacy while retaining the same controller.
- Final full real Redis suites: **166 standalone tests passed**, four Cluster-only skips; **170 six-node Cluster tests passed**, including failover. The five new persistence/isolation/retention/corruption/concurrency tests also ran independently in both modes.
- Main implementation: `src/features/player/item-pins.ts`, `server/item-pins-store.ts`, `server/item-pins.ts`, `components/inventory-tools.tsx`, the shared `server/item-finder.ts` and thin `/api/v2/items/pins` (+ `/readings`) routes. Tests: `tests/unit/player/item-pins.test.ts`, `tests/api/item-pins.test.ts`, `tests/browser/item-pins.spec.ts`, `tests/integration/redis-item-pins.test.ts`, plus finder regressions and the browser-only Redis preference model.

### N002 hosted verification

- [CI](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/42961660851): all 14 jobs passed, including all four browser shards, production smoke and CI / Required Checks.
- [Real Redis Cluster](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/42961661117): passed.
- [CodeQL](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/42961666455): both analyses passed.

## Current item: N003 saved equipment loadouts

Not started. N001 and N002 are complete; N003–N100 remain unchecked. No unresolved blocker is known. Next: read the Character/equipment UI, current inventory models and relevant docs, then implement bounded private saved loadout plans for harvesting, combat, building and exploration. Derive the exact linked character from the session/adapter; keep plans in Redis and do not equip/move game items. Readiness comparison is N004 and must not be claimed as already delivered. Add focused behavior/permission/failure, browser and real standalone/Cluster persistence coverage, run required checks and follow hosted checks before marking N003 complete.

Keep the complete PR backlog intact and PR #8 draft.

### Interruption and resume

Run `cd /workspace/Arrakis-Control-Dashboard`, read this file and `AGENTS.md`, then `git status --short --branch`, `git fetch origin v2` and compare `HEAD` with `FETCH_HEAD` before changing anything. Implementation is committed/published in `d4ed296`; only this evolving checkpoint should be modified locally. Do not overwrite another actor's advance.

Completed validation logs are under `/tmp/arrakis-n002-*`. Fixture-only command wrapper: `node /tmp/arrakis-clean-env.cjs <command>`. System-Chromium browser config: `--config=/tmp/arrakis-playwright.config.ts`; neither temporary file belongs in Git. The wrapper removes deployment variables from `.env.example` while preserving proxy/CA/PATH and clears font mocks.

Disposable Redis containers: `arrakis-expansion-redis` (`127.0.0.1:6391`, database 15) and `arrakis-expansion-cluster` (six nodes, client ports 7001–7006 bound only to loopback). Never substitute production Redis. Generated `next-env.d.ts`, build, browser and test output must stay outside feature commits.

No usage-reset trigger, recurring retry or automatic resumption is configured or promised. Resume from the actual checkpoint/branch state without duplicating completed IDs.
