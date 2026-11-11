# Community seasons implementation

Status: implemented for review on `feature/community-seasons`, [draft PR #9](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/9). The two-season browser acceptance workflow and real standalone/Cluster integration suites pass. Production readiness is not declared; the limitations below remain explicit.

## Audit and decisions

Source: [draft V2 PR #8](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/8), expansion backlog N081–N090 and its discussion. The backlog explicitly separates observations from evidence of historical actions, starts with dashboard cosmetics, and requires separate authorization for game rewards. No existing season engine, progression ledger, cosmetic ownership store or PostgreSQL schema exists. Redis is the only persistent store. The maintainer explicitly confirmed adapting this request to Redis on November 11, 2026.

Reuse the existing `route()` boundary, bounded bodies, same-origin mutation checks, session freshness, administrator allowlist and recent-sign-in requirement. Feature code belongs in `src/features/seasons/`; framework entries remain thin. Shared navigation retains its one inventory. Character presentation belongs to portal. Existing audio feedback owns opt-in sounds.

Inventory, map positions and currencies are observations, not proof of delivery, exploration history or mentoring. Initial automatically verified evidence must be limited to an explicitly implemented verifier. Other objectives require review; no arbitrary provider URLs or client claims grant XP. Game delivery execution stays unavailable until an authorized integration is verified. No casino activity awards XP.

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
| N088        | Separate proposal and second-admin approval/rejection queue; execution intentionally unavailable pending verified integration and authorization                                        |
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

## Validation evidence

- Full unit/API/architecture suite: **1,646 passed, 32 skipped**, 168 passing files and one skipped file.
- Season acceptance/security browser file: **2 passed**, including the complete two-season workflow.
- Typecheck, lint, formatting, documentation link/format checks and AI configuration validation passed.
- Production build passed with the pre-existing broad asset-path bundling warning. Both production smoke suites passed against local fixtures.
- Full browser suite: **180 passed** in six minutes, including existing administration, navigation, map, casino, guild, storage and security coverage plus the new season acceptance tests.
- [Hosted standalone Redis](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43085962077/job/130750290635): **170 passed, four Cluster-only skips**. [Six-node Cluster verification](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43085966933): **174 passed**, including all four new real-Lua season tests and existing live Cluster topology/failover cases. The new tests exercise concurrency, deadline checks, corrupted-key preflight, permanent ownership and independent seasons. No claim is made that the season suite itself interrupts writes during failover.
- [Hosted CI for implementation commit e6785d2](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43085962077) passed every quality job, all four browser shards, production smoke, standalone Redis and `CI / Required Checks`; dependency review also passed. Later documentation-only commits have their own CI runs and do not change the tested engine/UI source.

Initial sandbox runs failed to access OpenSSL, loopback TCP and a junction fixture; the same tests passed outside the sandbox. The initial browser acceptance attempt exposed filter-label accessibility and mobile intrinsic track overflow; fixes passed the rerun. No test was weakened or removed. Existing navigation expectation lists were extended for the new route/tab.

## Remaining limitations

- Game delivery execution, uncertain-send reconciliation, retries and recovery require a verified integration and explicit authorization. Approval currently grants no game resources. This is the external blocker for full N088 completion.
- Artwork uses selectable original motifs, colors and seasonal themes; arbitrary uploads are not implemented.
- Published definitions cannot receive live presentation-only edits or reward rewrites. Audited XP corrections and lifecycle operations remain available; future content is prepared in a duplicate draft.
- Community progress updates on load/member actions; there is no live push/poll notification channel for changes by other members.
- Physical device, Safari/iOS, screen-reader and production Discord/Console staging are unverified. Browser tests use isolated RESP/Console fixtures; they do not prove Lua atomicity or provider behavior.
- No merge, release, deployment, source-PR closure or remote ruleset change has occurred.
