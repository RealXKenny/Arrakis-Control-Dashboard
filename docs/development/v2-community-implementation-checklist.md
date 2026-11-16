# Version 2 community implementation checklist

This is a continuation record, not a claim of completion. Check an item only after its integration and verification are complete. The original task defines the detailed acceptance criteria.

## Repository and shared foundations

- [x] Inspect instructions, working tree, branch and PR #8; fetch origin. At inspection, `v2` matched `origin/v2` and PR #8 was open against `main`.
- [ ] Recheck remote and working tree before delivery; preserve concurrent work and use no new branch, force push or merge.
- [ ] Resolve data-source, identity, authorization and retention contracts for each feature against current code. Redis is the existing persistent store; the brief incorrectly assumes an existing PostgreSQL deployment. Do not invent a migration or use production data for tests.
- [ ] Design bounded, Cluster-safe atomic state, durable recovery, rate limits, audit events, notification integration and least-privilege worker boundaries where applicable.
- [ ] Review responsive design, keyboard and screen-reader support, reduced motion, local time, loading, empty, error and stale states for all interfaces.

## AI configuration

- [x] Inspect tracked Claude guide and local ignored configuration; migrate relevant general guidance into `AGENTS.md`.
- [x] Remove tracked `CLAUDE.md` and, with user consent, local `.claude/`; keep its existing ignore rule.
- [x] Remove Claude-specific validator requirements; update root inventory, architecture test and current command/CI documentation.
- [x] Run `npm run ai:check`, `npm run docs:check` and `npm run workflows:check` successfully.
- [ ] Recheck repository-local instruction paths, workflow references, tests, and ignored files before delivery; verify tool-specific instruction loading is not claimed without evidence.

## Worktree cleanup

- [x] Inspect `git worktree list --porcelain` and `git worktree prune --dry-run --verbose`: only the current `v2` checkout is registered and no stale entries were reported.
- [x] Add `.worktrees/` to `.gitignore`; no recreation reference was found in the searched project configuration, scripts and documentation.
- [ ] Confirm whether `.worktrees/pr8-integration/.next` is used by any other session or automation before removing it. It is not a registered worktree; process inspection was denied, so it has been left untouched. Remove the parent only after confirming safe cleanup and checking its contents.
- [ ] Recheck worktrees, branch and PR before delivery; document any completed cleanup accurately in the changelog.

## Features

- [ ] **N071:** authoritative upcoming schedules and live local-time countdown; affected services/maps, interruption impact, scheduled/imminent/active/completed/canceled states, rescheduling, confirmed versus estimated data, monitoring and notifications, responsive UI; never invent schedules.
- [ ] **N072:** bounded deduplicated health observations, outages/degradation/recovery, verified restarts, severity/services, timestamps/duration, observed versus confirmed, filtering/history, efficient retention and monitoring integration; do not invent causes.
- [ ] **N073:** collect supported population observations, aggregate by local hour/day, identify busy/quiet periods, supported server/map filters, coverage, missing versus zero, freshness, accessible interactive display, bounded efficient retention; no predictions.
- [ ] **N074:** unify published events, authorized personal operation commitments, visible maintenance and supported schedules; month/week/agenda, categories, details, local time, permissions, confirmed/tentative state, deduplication, notifications and responsive layouts.
- [ ] **N075:** authorized eligibility and registration, limits, concurrency-safe duplicate prevention, deadlines, waiting lists and automatic promotion, cancellation and event cancellation, private attendance, status, calendar and notifications.
- [ ] **N076:** authorized submissions with ownership, deadlines, editing/withdrawal, safe storage, validated bounded image/attachment types, retention, permission-aware responsive gallery, review states and separately confirmed judging; never invent winners.
- [ ] **N077:** bounded rate-limited help requests for all requested categories, availability and matching, atomic assignment, full lifecycle, ownership, privacy, abuse/reporting, cancellation and history, identity/chat and notifications.
- [ ] **N078:** authorized read-only backup evidence, age and available schedule, success/failure history, separate restore-rehearsal evidence and stale/missing states; sanitize output and document unavailable trusted evidence. No backup contents, credentials or admin endpoints.
- [ ] **N079:** player report intake, least-privilege moderator authorization separate from administrators, structured cases, authorized evidence, assignment, status, decisions/reasons, audit history, filtering/search, closure, sensitive-data protection and retention.
- [ ] **N080:** bounded cached/rate-limited read-only capability probes, support/unsupported/permission/outage distinctions, stale and last-success times, sanitized explanations and health categories, restricted infrastructure details and monitoring integration; no elevated permission requests.
- [ ] For every feature, verify actual data sources, permissions, connected UI/API, security, concurrency, recovery, retention and focused tests before marking complete.

## Release audit and delivery

- [ ] Audit every commit and relevant diff in the verified v2 range, including merge/squash ancestry, reverted or superseded work, all contributors and current behavior. Initial merge base is `a5cfb484074bf4d9d7e8930257049e7635c7d579`; `a5cfb484..d177acd` has 107 commits. Reverify after fetching before finalizing.
- [ ] Correct contradictory and stale v2 changelog claims, group meaningful verified changes, preserve prior releases, document completed features and removals accurately, and check release parser conventions and package/lockfile version consistency.
- [ ] Run standard format, typecheck, lint and unit tests; applicable build, production smoke, browser/mobile/accessibility, security, concurrency, idempotency, worker and disposable standalone/Cluster Redis integration checks. Investigate failures without weakening tests.
- [ ] Independently compare the original task with the final implementation and evidence, review the complete diff and security boundaries, commit only task changes, push verified commits to `origin/v2`, and update existing open PR #8 with honest verification. Do not create a branch or PR or merge.

## Initial verification observations

- `npm test` on Windows: 181 test files passed, 4 failed, 1 skipped; 1,263 tests passed, 4 failed, 42 skipped. Failures involved disposable TLS certificate generation, test Redis connections and a Windows junction. Diagnose with appropriate isolated infrastructure before attributing them to the environment or declaring the suite passed.
- Outside the sandbox, all four previously failing files passed (39 tests), and the full unit suite passed: 185 files and 1,277 tests passed, with one file and 32 tests skipped. The prior failures are consistent with sandbox restrictions.
- Existing population recording samples one aggregate count per minute with 24-hour retention; it does not by itself implement N073's historical heatmap or per-map coverage.
- Community events currently have a bounded Redis store and published member reads; the former administrator event editor was removed, so its old documentation is not an authoritative publishing workflow.
