# Community seasons implementation

Status: implemented for review on `feature/community-seasons`, [draft PR #9](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/9). The two-season browser acceptance workflow passes. Earlier real standalone/Cluster integration suites passed; the current delivery/import revision requires its own hosted Redis results, recorded below when available. Production readiness is not declared; the limitations below remain explicit.

## Audit and decisions

Source: [draft V2 PR #8](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/8), expansion backlog N081–N090 and its discussion. The backlog explicitly separates observations from evidence of historical actions, starts with dashboard cosmetics, and requires separate authorization for game rewards. No existing season engine, progression ledger, cosmetic ownership store or PostgreSQL schema exists. Redis is the only persistent store. The maintainer explicitly confirmed adapting this request to Redis on November 11, 2026.

Reuse the existing `route()` boundary, bounded bodies, same-origin mutation checks, session freshness, administrator allowlist and recent-sign-in requirement. Feature code belongs in `src/features/seasons/`; framework entries remain thin. Shared navigation retains its one inventory. Character presentation belongs to portal. Existing audio feedback owns opt-in sounds.

Inventory, map positions and currencies are observations, not proof of delivery, exploration history or mentoring. Automatically verified evidence is limited to the explicitly implemented linked-character verifier. Other objectives require review; no arbitrary provider URLs or client claims grant XP. Game delivery uses the verified fixed Console contract, remains default-off and requires independent review plus explicit execution; uncertain outcomes never resend automatically. No casino activity awards XP.

## Implementation stages

1. Versioned definitions, deterministic lifecycle/leveling, fairness validation and immutable publication.
2. Redis single-slot compare-and-set transactions for submissions, append-only XP events, reward claims, cosmetics and milestones. No expiry on season recognition; no silent eviction or automatic write retries.
3. Existing admin workspace: season builder, editable reward/challenge/milestone lists, preview, templates, publication, moderation and audit views.
4. Member pass, challenge browser, history, cosmetic equipment and profile integration, responsive styling and opt-in audio.
5. Focused unit/API/concurrency/integration/browser coverage; standard checks, build, production smoke, screenshots and the two-season acceptance workflow.

## Acceptance gate

Do not describe this feature as complete until a disposable test environment creates, configures, publishes, progresses, claims, equips and archives Season 1 through the UI, then creates and publishes independent Season 2 from a template while preserving Season 1 history. Report unavailable real Redis/Cluster or browser verification separately. Do not use production player data or deployment secrets for acceptance tests.

## Requirement mapping and deliverables

| Requirement | Implementation                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N081        | Versioned season definitions, names/slugs/numbers, UTC dates, IANA calendar zone, private draft/preview, schedule-overlap validation, date-derived activation/end and explicit archive |
| N082        | Independent integer XP, cumulative thresholds, capped levels, append-only per-account ledger and progress history; no currency/game ledger access                                      |
| N083        | Solo path and publication gate requiring independently attainable maximum level without guild membership                                                                               |
| N084        | Editable builder/explorer/supplier/mentor paths with theoretical XP opportunities within 10%                                                                                           |
| N085        | Fresh linked-character verifier; bounded text/HTTPS evidence for moderation, private queue, notes, rejection and retained history                                                      |
| N086        | Atomic CAS, commit-time deadlines, stable submission/claim/correction identity, self-review refusal and appended correction records                                                    |
| N087        | Permanent copied badge/banner/title/decoration/achievement definitions, claim/equip checks and Character showcase                                                                      |
| N088        | Frozen claimed Solaris/item rewards, separate review, offline/link preflight, one CAS-fenced Console write and terminal uncertain-send reconciliation                                  |
| N089        | Cooperative completion totals, atomic milestone unlock timestamps, shared recognition and retained aggregate history                                                                   |
| N090        | Permanent per-season progress, challenges, claims, cosmetics and milestone history, paginated archives and historical reward tracks                                                    |

Engine files: `src/features/seasons/contracts.ts`, `server/store.ts`, `server/engine.ts`, `server/http.ts`. Member/admin UI and original SVG art live under `src/features/seasons/components/`; responsive feature styling lives under `styles/`. The global navigation and existing admin catalog select the new screens. Character composes the season showcase without allowing shared UI to import feature internals.

New pages: `/seasons`, `/seasons/challenges`, `/seasons/history`; administration uses `/admin?tab=seasons`. New API entry points: `/api/v2/seasons` (GET/POST) and `/api/v2/admin/seasons` (GET/POST). See the [feature guide](../features/community-seasons.md#apis) for actions and request boundaries.

No SQL migrations, PostgreSQL packages or environment variables were added. Redis v1 namespaced records initialize lazily. Published identities are permanently reserved; published definitions are immutable. There is no automatic persistent-data cleanup or destructive migration. See the [storage schema](../features/community-seasons.md#persistent-redis-schema) and [deployment instructions](../features/community-seasons.md#deployment-testing-and-troubleshooting).

## Executed acceptance workflow

`tests/browser/seasons.spec.ts` creates Season 1 through the visual administrator form, configures its schedule and thresholds, saves/previews/publishes it, submits a solo member's evidence, approves it with a separate administrator, verifies 700 XP and level 5, claims and equips the achievement, ends/archives the season, checks retained history, duplicates the archived definition into Season 2, customizes/publishes it and verifies zero independent XP with Season 1's equipped cosmetic still shown on Character. No source changes or production records are used within the workflow.

The default template supplies the editable five-path challenge set, five cosmetic reward definitions and community milestone. Their editors are implemented; the acceptance workflow directly edits schedule/XP fields and uses the supplied reward/challenge/milestone content. It does not independently exercise every editor add/remove/reorder control. Separate regression tests cover moderation, eligibility, duplicate/concurrent awards, claims, corrections, schedule overlap, fairness, recurrence calendars and milestone aggregation.

Native modal focus containment and reduced motion are checked. Mobile context uses touch emulation, DPR 3 and 393 × 852, with additional overflow checks at 320, 360, 412 and 768px; desktop is 1440 × 1000. These are emulated Chromium checks, not physical Samsung/iPhone or VoiceOver/TalkBack verification.

Screenshots from the running built application: [desktop](../assets/screenshots/community-season-desktop.png), [mobile](../assets/screenshots/community-season-mobile.png). They use disposable test accounts and original generated-by-code artwork.

## Initial implementation validation evidence

- Full unit/API/architecture suite: **1,646 passed, 32 skipped**, 168 passing files and one skipped file.
- Season acceptance/security browser file: **2 passed**, including the complete two-season workflow.
- Typecheck, lint, formatting, documentation link/format checks and AI configuration validation passed.
- Production build passed with the pre-existing broad asset-path bundling warning. Both production smoke suites passed against local fixtures.
- Full browser suite: **180 passed** in six minutes, including existing administration, navigation, map, casino, guild, storage and security coverage plus the new season acceptance tests.
- [Hosted standalone Redis](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43085962077/job/130750290635): **170 passed, four Cluster-only skips**. [Six-node Cluster verification](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43085966933): **174 passed**, including all four new real-Lua season tests and existing live Cluster topology/failover cases. The new tests exercise concurrency, deadline checks, corrupted-key preflight, permanent ownership and independent seasons. No claim is made that the season suite itself interrupts writes during failover.
- [Hosted CI for implementation commit e6785d2](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43085962077) passed every quality job, all four browser shards, production smoke, standalone Redis and `CI / Required Checks`; dependency review also passed. Later documentation-only commits have their own CI runs and do not change the tested engine/UI source.

Initial sandbox runs failed to access OpenSSL, loopback TCP and a junction fixture; the same tests passed outside the sandbox. The initial browser acceptance attempt exposed filter-label accessibility and mobile intrinsic track overflow; fixes passed the rerun. No test was weakened or removed. Existing navigation expectation lists were extended for the new route/tab.

## Remaining limitations

- Game delivery originally remained unavailable during the finishing work. The maintainer subsequently authorized Solaris and item integration; it is now implemented behind an independent default-off gate, as documented below. Live-provider staging is still unverified.
- Published gameplay/reward definitions remain frozen. The separate live presentation editor cannot rewrite rewards, XP rules, objectives or historical claims.
- Physical device, installed Safari/iOS, screen-reader-product and production Discord/Console staging are unverified. Automated WebKit/Safari/iPhone emulation is covered below. Browser fixtures do not prove Lua atomicity or real-provider behavior.
- No merge, release, deployment, source-PR closure or remote ruleset change has occurred.

## PR #9 finishing work

The maintainer explicitly requested image uploads, safe live edits, live community progress and Safari/mobile accessibility coverage while keeping game delivery disabled.

- **Artwork:** admin-only binary upload; 3 MiB input, 4096px/8-million-pixel decode limits, rejected SVG/animation/corruption, metadata stripping and bounded WebP output. Sharp 0.35.5, already present through Next.js, is pinned as a direct dependency. Content-addressed image records are immutable; each season indexes at most 128 unique uploads. Authenticated image routes require an authorized published reference or administrator access. Draft images remain private. Hero/reward uploads expose alternative text, preview and removal controls; claimed artwork references never change.
- **Live edits:** only subtitle, description, theme and hero image form a versioned presentation overlay. Current UUID revision, recent admin sign-in, typed name, reason, commit-time deadline, permanent before/after snapshot and an audit entry protect every save. Archived/ended edits are rejected. The admin audit can inspect changes; restoring the published presentation creates a new audited operation. Duplicated season templates include the current presentation without changing prior history.
- **Live community:** a bounded aggregate-only API and visibility-aware 15-second polling with one in-flight request, five-second deadline, hidden-page cancellation, immediate resume and exponential failure backoff. Confirmed totals remain visible during failures. Monotonic season/totals versions reject stale responses. Milestone unlocks use polite announcements; passive polls remain silent.
- **Accessibility and Safari:** focused projects for Chromium, Android touch emulation, desktop WebKit and iPhone WebKit. The HTTPS fixture has its own canonical application origin and temporary certificate; production CSP and origin validation remain intact. Fixed native-dialog Tab wrapping/focus restoration, explicit prefilled-field labels and the administration breadcrumb's touch target. Reward scrolling has visible previous/next controls and respects reduced motion.

New endpoints are documented in the [feature guide](../features/community-seasons.md#apis). `tests/browser/seasons-cross-browser.spec.ts` tests uploads, unpublished-image privacy, another account's contribution appearing live, image/text changes without reload, frozen claims, stale/forged edits, outage/backoff/hidden states, keyboard/focus restoration, long evidence, minimum button sizes, reduced motion, WCAG AA and reviewed delivery execution. The original two-season acceptance workflow remains intact and scopes its historical assertions to the intended season when other fixture seasons exist.

Finishing validation: **1,652 unit/API/architecture tests passed, 32 skipped**; the expanded **196-case browser suite passed**, followed by a final focused rerun covering aggregate privacy, touch interaction and audited presentation rollback. Typecheck, lint, formatting, documentation/AI/workflow validation, production build and both production smoke suites passed. The previous documentation-head [CI run](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43087100831) completed with every required check passing before this finishing work began. Follow-up hosted results are available from [PR #9 checks](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/9/checks); the real Redis suite now includes a concurrent presentation-snapshot/commit-time-deadline case.

The first finishing CI run exposed a Linux WebKit fixture difference: manually supplied `Cookie` headers did not authenticate browser navigations, although API setup requests succeeded. HTTPS WebKit contexts now use real secure, HttpOnly, host-prefixed session cookies through the browser cookie jar. Application authentication, CSP and origin checks are unchanged. This correction retains all Safari/iPhone cases; none are skipped or weakened.

Follow-up screenshots show an uploaded image retained on a claimed reward while the hero presentation changes: [Safari desktop](../assets/screenshots/community-season-uploaded-safari.png), [iPhone/WebKit](../assets/screenshots/community-season-uploaded-iphone.png). The raster fixtures deliberately use solid colors to verify uploads and preserve no personal content.

## Reviewed delivery and launch content

The maintainer subsequently authorized both Solaris and item delivery. Optional `gameReward` definitions freeze with publication and claims. Members request delivery only for their own claimed rewards; administrators may also request with an authorization basis. Fresh adapter links capture pawn/controller IDs, a separate administrator reviews, and execution requires recent high-risk sign-in, an exact current revision, typed confirmation and a fresh offline/link/claim preflight. Redis persists `sending` before exactly one non-retried administrator-key Console POST. Exact Solaris/item receipts are required. Unknown, partial, malformed and interrupted outcomes enter reconciliation and never rearm automatically; verified-not-applied outcomes become terminal cancellations. Legacy unstructured proposals remain reviewable but cannot execute. Season XP and casino wallets remain independent.

The complete Season 1 package and reusable Season 2 template live in `src/features/seasons/content/`. Both provide ten cosmetics, fifteen challenges, three milestones and exactly 5,000 attainable XP on every path. Season 1 uses America/New_York for January 5–April 6, 2027, includes original raster hero art, and configures 250 Solaris plus five grade-0 `WaterPack_Consumable` items. The template ID was checked against RedBlink's pinned catalog; no live item grant was attempted. The validated importer uses fixed package IDs and the engine CAS commit, requires an explicit sanitized target match and creates drafts only.

Season 1 was imported into the configured six-node Redis Cluster as `season-1-sands-of-beginnings` with phase `draft`; an immediate identical rerun returned `UNCHANGED`. No season was published, no progression or delivery was created, and no environment gate or player record changed. A production-build browser fixture separately loaded the packaged definition, uploaded its artwork, edited the draft and previewed all ten rewards through the real admin UI. This verifies the package's admin edit/preview path, not an authenticated session on the configured deployment.

Current local checks: **1,671 unit/API/architecture tests passed, 32 existing installer tests skipped**; formatting, typecheck, lint, documentation, AI/workflow validation, production build and both production smoke suites passed. All **22 pre-content season browser cases passed**, including four Solaris/item delivery cases across Chromium, desktop WebKit, iPhone WebKit and Android emulation. The packaged Season 1 admin edit/preview case also passed. The complete 201-case browser run had **200 passes** and one unrelated existing live-map admin timing failure; that case passed its immediate isolated rerun in 727ms, and no season case failed. Current real standalone/Cluster results remain hosted-workflow checks rather than tests against the configured cluster. Fixture and source-contract verification are not live-provider staging.
