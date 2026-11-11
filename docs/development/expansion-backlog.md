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

## Current item: N002 pinned item counters

Not implemented yet. Next: inspect the completed finder and existing bounded private Redis/CAS patterns, then implement per-character pinned essential-item counters with fresh independent source permissions, exact quantities and honest partial/unknown coverage. Add unit/API/browser and real standalone/Cluster persistence tests. Do not change game inventory/currency or authorize by item names.

The checkout is on `v2`; the completion checkpoint is the only pending modification before starting N002. Disposable local Redis runs in Docker container `arrakis-expansion-redis`, bound only to `127.0.0.1:6391`, database 15. Never substitute a production Redis URL. Source implementation starts at `src/features/player/server/item-finder.ts`, UI at `src/features/player/components/item-finder.tsx` and route at `src/app/api/v2/items/find/route.ts`.

Resume after an interruption: `cd /workspace/Arrakis-Control-Dashboard`, read this file and `AGENTS.md`, then run `git status --short --branch`, `git fetch origin v2` and compare `HEAD` with `FETCH_HEAD` before changing anything. Inspect the linked run jobs through the verified GitHub connection. No usage-reset trigger, recurring retry or automatic resumption is configured.
