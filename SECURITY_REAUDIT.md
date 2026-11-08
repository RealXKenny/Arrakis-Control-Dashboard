# Security Re-Audit — Arrakis Control Dashboard v2

Branch `security-audit`. Nothing committed, pushed, merged or deployed. This is an independent second pass: earlier statuses were treated as claims, not facts. Scope notes: local-only verification (unit and API tests, real local sockets, a local `next start`, a pristine-`HEAD` worktree for browser baselines); no live infrastructure was contacted and no credential was validated.

## Executive summary

**Posture: good for a Redis-backed Next.js application, still not proven.** No Critical or High issue was found. The re-audit disproved two earlier conclusions: SEC-03 ("session resurrection") was only partly fixed, because Auth.js re-writes the session on every `/api/auth/session` read, and SEC-08 ("admin step-up") left every admin download (backups, exports, logs) unprotected. Both are now fixed with tests. Nine further issues (SEC-17 to SEC-25) were found in code the first pass had not read; six are fixed and three remain open.

| Result | Count |
| --- | --- |
| Previous findings independently verified as FIXED | 9 of 14 (SEC-03 and SEC-08 needed additional fixes) |
| Previous findings PARTIALLY FIXED | 3 (SEC-08, 10, 11) |
| Previous findings needing an owner decision | 2 (SEC-12, 13) — **not** accepted by me |
| New findings (SEC-15 – SEC-25) | 11: 8 FIXED, 3 OPEN (owner decision / migration) |

Limits: no live penetration test; client-side map and 3D rendering code and the Redis data-provider internals were read only for security-relevant paths; the pre-V2 browser suite (53 tests) is stale and could not serve as evidence.

## Phase 1 — Previous findings, independently verified

| ID | Orig. | Previous | Verified now | Evidence / bypass analysis |
| --- | --- | --- | --- | --- |
| SEC-01 | Medium | FIXED | **FIXED** | `login-limits.ts` skips the shared bucket for unknown addresses; per-email (10/15 min) and address+email (8) remain. Test asserts 60 accounts from `unknown` pass and one account is limited. Residual: attackers cannot be limited by IP when no address exists; per-account limits still hold. |
| SEC-02 | Low | FIXED | **FIXED** | `read-budget.ts` keys by hashed session ID when the address is unknown. Test covers both branches. |
| SEC-03 | Low | FIXED | **FIXED after correction** | Original fix covered re-verification, password setup and the player cache, but `jwt.encode` in `config.ts` still wrote unconditionally. Confirmed in `@auth/core/lib/actions/session.js` (re-encodes on read). Now uses `onlyIfExists` for existing session IDs; new test `jwt-encode.test.ts` deletes a session and re-encodes it. See SEC-15. |
| SEC-04 | Low | FIXED | **FIXED** | 300/min fail-closed admin budget on execute and upload; verified in code and tests. Admin overview/catalog reads are not budgeted (read-only). |
| SEC-05 | Low | FIXED | **FIXED** | Runtime check against a production `next start`: the CSP header contains no Announcify or other third-party script/connect origin (`img-src` only the Discord CDN). Unit test asserts the same. `style-src 'unsafe-inline'` remains (Next/Tailwind). |
| SEC-06 | Low | FIXED | **FIXED** | Previous tests mocked `fetch`, which proves nothing. Added a real-socket test: a 302 from a local server is refused and the redirect target receives 0 hits. |
| SEC-07 | Low | FIXED | **FIXED** | Refresh header honoured 6×/min per cache scope; test confirms only 6 of 10 refreshes reach the loader. |
| SEC-08 | Medium | PARTIALLY | **PARTIALLY FIXED** | `authenticatedAt` is server-side and unforgeable by clients, set only on interactive login, preserved by re-verification. **Gap found:** download operations (backups, system backups, exports, logs) are GET and skipped the check (SEC-16, fixed). All admin write paths enumerated: execute (non-GET + download), upload, announce, admin chat reply — all gated. Remaining: no MFA; a stolen cookie works for up to `ADMIN_REAUTH_HOURS`. **Recommendation:** 12 h is generous for destructive actions; set `ADMIN_REAUTH_HOURS` to 1–4 after confirming admins accept re-login (left at 12 to avoid breaking the dashboard silently). |
| SEC-09 | Low | FIXED | **FIXED (not executed on GitHub)** | All `uses:` lines pinned to 40-char SHAs resolved through the GitHub API (each tag resolved to a commit). Workflow permissions re-read: `contents: read`; release job `contents: write`; `pull_request` (not `pull_request_target`); release guarded to main pushes. The workflows themselves were not run. |
| SEC-10 | Info | PARTIALLY | **PARTIALLY FIXED** | Added opt-in `REDIS_REQUIRE_TLS=true` (production refuses to start unless `rediss://`). Default left as warning-only because Pterodactyl deployments commonly use a plain-text Redis allocation; enforcing by default would break them. Fail-closed behaviour verified: rate limiter returns 503 when Redis is unreachable (observed live: `/api/auth/csrf` returned 503 against a dead Redis); sessions never fall back to memory in production. |
| SEC-11 | Info | PARTIALLY | **PARTIALLY FIXED** | `npm audit`: 0 / 0 (full and production). Lockfile: 548 packages, all `registry.npmjs.org`, all with integrity hashes; `npm audit signatures`: 115 verified attestations, no failures; `npm ls` reports no invalid/missing/extraneous packages. Install scripts: only `unrs-resolver` (dev) and `fsevents` (macOS optional). Deprecated: `eslint@9.39.5` (dev). `next-auth@5.0.0-beta.32` is a pre-release (its npm `latest` tag is v4), pinned exactly. The `minimatch@^11.0.5` override applies to `typescript-estree` only; build and lint still work. A zero audit does not cover un-reviewed install-time behaviour. |
| SEC-12 | Info | ACCEPTED (pending) | **BLOCKED — owner decision** | Exploitability: needs an incident; no attack path. Impact: admin and permission-change events exist only in process stdout, so investigation depends on infrastructure log retention. Compensating: request IDs, redacted structured logs, Redis state. Recommended: forward stdout to retained storage; optionally add a bounded Redis audit stream. Not accepted on your behalf. |
| SEC-13 | Low | ACCEPTED (pending) | **BLOCKED — owner decision** | Exploitability: any verified guild leader can publish a listing with another guild's name. Impact: social engineering of applicants; applications still go to the publisher's own verified inbox, so no data reaches the impersonated guild. Compensating: leader verification, listing keyed by guild ID. Recommended: source the display name from Console or show the verified guild ID. Not accepted on your behalf. |
| SEC-14 | Low | FIXED | **FIXED** | 120/min per address in the route wrapper; skipped for unknown addresses; unit test with two addresses. Observed live: Next adds an `X-Forwarded-For` from the socket, so the limiter engages even for direct requests when `TRUSTED_PROXY_COUNT` is 1. |

## New findings

| ID | Severity | Conf. | CWE | Status |
| --- | --- | --- | --- | --- |
| SEC-15 | Medium | High | CWE-613, CWE-362 | FIXED |
| SEC-16 | Medium | High | CWE-306, CWE-862 | FIXED |
| SEC-17 | Medium | High | CWE-639, CWE-613 | FIXED |
| SEC-18 | Low | High | CWE-697 | FIXED |
| SEC-19 | Low | High | CWE-200 | FIXED |
| SEC-20 | Low | High | CWE-799, CWE-770 | FIXED |
| SEC-21 | Low | High | CWE-20, CWE-1321 | FIXED |
| SEC-22 | Medium (availability) | High | CWE-829, CWE-1104 | FIXED (partly) |
| SEC-23 | Low | Medium | CWE-770 | OPEN — owner decision |
| SEC-24 | Low | Medium | CWE-359 | OPEN — migration needed |
| SEC-25 | Info | Medium | CWE-400 | OPEN |

**SEC-15 — Auth.js session write-back recreates signed-out sessions.** `src/features/auth/server/config.ts` (`jwt.encode`). Root cause: Auth.js re-encodes the token on every session read (`@auth/core/lib/actions/session.js:46`); the callback saved with plain `SET`, so a session deleted between decode and encode came back for its full TTL and stale snapshots overwrote newer re-verification data. Prerequisites: a victim signing out while their (or an attacker's replayed) cookie is mid-request. Impact: logout and revocation not reliably final. Fix: existing session IDs are saved with `SET … XX`. Verification: `tests/unit/auth/jwt-encode.test.ts` (sign-out then re-encode leaves the session absent).

**SEC-16 — Admin downloads skipped the step-up check.** `src/app/api/v2/admin/execute/route.ts`. Root cause: the check covered only non-GET operations, but backups, system backup archives, base/storage/blueprint exports and logs are GET `download` operations. Impact: a stolen admin cookie could exfiltrate backups without re-authentication. Fix: `mode === 'download'` also requires a recent sign-in. Verification: `tests/api/admin.test.ts` loops every unrestricted download operation in the catalog and asserts 403 `ADMIN_REAUTH_REQUIRED` with no upstream call.

**SEC-17 — Vehicles used a 30-day cached character.** `src/features/vehicles/server/load.ts`. Root cause: `session.linkedPlayerId` was copied into the session once and trusted for the whole login. A member who unlinks or re-links (or whose old character is later linked by someone else) kept seeing the former character's vehicles. Fix: the link is read from the adapter each time (30 s per-member cache). The cached name/ID remain for display only (`identity.ts`, marketplace author). Verification: `tests/unit/vehicles/linked-character.test.ts`.

**SEC-18 — Guild shown by non-unique character name.** `src/features/player/server/handler.ts`. A same-named member of another guild could be displayed as the player's guild and rank (display integrity). Fix: `rosterRowIsPlayer` matches by any known ID field; names only for rows with no ID. Verification: `tests/unit/player/roster-match.test.ts`.

**SEC-19 — Seller player IDs in market price ladders.** `src/features/market/server/market-listings.ts`. Console rows carry `owner_id` for other members' orders, passed to every member's browser although the UI never uses it. Fix: `withoutSellerIds` strips `owner_id`/`ownerId`. Own-listings path (server-side filtering) is unaffected. Test: `tests/unit/market/seller-ids.test.ts`.

**SEC-20 — Per-address limits bypassable through IPv6.** `src/lib/security/rate-limit.ts`. A client with a /64 could present 2^64 addresses, each with a fresh budget on read, Auth.js and API limits. Fix: IPv6 callers are keyed by their /64. Tests in `client-address.test.ts`.

**SEC-21 — `/login?error=constructor` broke the sign-in page.** `src/app/login/page.tsx`. A plain-object lookup returned an inherited function that was passed to a client component. A crafted link could make the login page error. Fix: `signInNotice` uses a `Map`. Test: `tests/unit/auth/notices.test.ts`. A repository search for other URL-keyed object lookups found only fixed-key or allowlisted uses.

**SEC-22 — Pterodactyl egg could not start and ran dependency scripts as root.** `scripts/deployment/build-pterodactyl-egg.mjs`. The startup command pointed at `src/config/server-launcher.mjs`, which no longer exists (the launcher is `scripts/server-launcher.mjs`), so a fresh install could not boot. Installation ran `npm ci` with lifecycle scripts as root in the install container. Fix: correct path; `npm ci --ignore-scripts` (a build with `--ignore-scripts` was verified locally). The egg test now asserts the launcher file exists. Remaining: the egg installs the latest GitHub release over TLS without signature or checksum verification, so a compromise of the release channel yields code execution; pin or verify releases if that matters to you. Secret variables remain visible to panel users with startup access (normal Pterodactyl behaviour).

**SEC-23 — Marketplace capacity exhaustion (open).** `features/bases/server/marketplace.ts`. 25 listings per member, 500 total, 2 MiB each: about 20 members can fill the marketplace (and about 1 GB of Redis) for everyone. Prerequisite: guild membership. Treatment is a policy choice (lower caps, per-guild caps, moderation); not changed.

**SEC-24 — Listing owner key is a guessable hash (open).** `ownerKeyFor` is `sha256("base-marketplace-owner:" + discordId)` truncated, and appears in summaries sent to members. Discord IDs are public, so any member can test whether a given user published a listing. Fix needs an HMAC with a server secret and a rewrite of stored `ownerKey` values and per-user counters (a migration); not done to avoid orphaning existing listings.

**SEC-25 — Fan-out and public status (info).** `/api/server/status` is public by design (counts only, cached, rate limited). `/api/player` walks up to 100 guilds with sequential member lookups per refresh. Both are bounded by caching and rate limits.

## Phase 3/4 — Coverage matrix

Legend: **I** inspected line by line, **D** dynamically exercised (test or local server), **P** partially reviewed, **N** not tested.

| Component | Status | Notes |
| --- | --- | --- |
| Auth.js config, sessions, reverify, password, users | I, D | Unit tests with real in-memory store; headers/cookies checked on `next start` |
| Admin gate, catalog, execute, upload, sanitize, guilds | I, D | All write and download paths enumerated |
| Guild applications, chat, support, logo, requirements, membership | I, D (unit/API) | Authorization and origin checks traced |
| Bases import/export/preview/marketplace (legacy and v2) | I, D (unit/API) | Schemas, sniffing, ownership, limits read |
| Map, realtime, market, vehicles, player, portal world, server status | I | Loaders and handlers read; D only through existing tests |
| Dune/Console transport, adapter, Discord OAuth, webhook | I, D | Redirect refusal tested on real sockets |
| Redis client, rate limiter, keys, data-provider, pool | I (client, limiter, keys), P (data-provider, pool) | Fail-closed verified |
| Proxy, CSP, security headers | I, D | Verified on production server |
| Egg builder, launcher, maintenance scripts | I | Maintenance scripts are offline operator tools; egg fixed |
| GitHub Actions | I | Not executed |
| Dependencies | I, D | audit, signatures, lock analysis |
| React components (XSS sinks, links) | P | grep for sinks plus targeted reads; no `dangerouslySetInnerHTML` |
| 3D map/terrain rendering code | P | client-only; asset allowlist read |
| PostgreSQL, Docker/Compose | N/A | Not present in the repository |
| WebSockets | N/A | None; realtime is polling over HTTP (snapshot cache 1 s) |
| Load/stress, external pen test, MFA flows | N | Not performed |

## Phase 6 — Playwright investigation

Command: `npx playwright test` (project `chromium`, `reuseExistingServer`, fixture Redis from `tests/helpers/browser-server.mjs`).

| Run | Passed | Failed | Skipped | Blocked |
| --- | --- | --- | --- | --- |
| Pristine `HEAD` (b30e8fa) in a separate worktree, own build | 24 | 55 | 0 | – |
| Current tree before spec edit | 24 | 55 | 0 | – |
| Test-by-test comparison | identical sets, **zero differences** | | | |
| After correcting two specs (re-run individually) | +2 | −2 | | |

So the failures predate all security work (including the user's uncommitted UI changes at the time of the baseline commit) and no remediation regression exists in the browser suite. Causes at the baseline: the specs target the pre-V2 UI (headings such as "Desert Navigator", `.vehicle-grid`, `.base-grid`, `[data-map-view="3d"]`, legacy `/portal?view=` pages) that no longer exist in `src`.

By file (failing after correction): admin 3, announcements 1 (tests a removed Announcify widget), bases 13, guilds 9, landing 2, map 8, market 1, player 5, portal 9, vehicles 2 = **53 failing, 26 passing, 0 skipped.** I fixed the two genuine fixture mismatches (`admin.spec.ts` expected a client-mocked Console origin while the page is server-rendered from `CONSOLE_URL`; the assertion now checks the configured origin). The other 53 are **BLOCKED**: bringing them up to date means rewriting them against the V2 interface (and some need per-test environment such as an unconfigured adapter, which the shared Playwright server cannot provide). Rewriting them blind would risk weakening assertions, so I did not. The full browser suite was not re-run after the two-spec edit; those two specs were run individually and passed. Administrator specs that do pass include member denial, confirmations and privileged flows.

## Phase 9 — Verification results (final run, current tree)

| Check | Result |
| --- | --- |
| `npm run format:check` | passed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (`--max-warnings 0`) |
| `npm test` | 94 files, **912 passed, 0 failed, 0 skipped** |
| `npm run build` | succeeded |
| `npm run test:production` | passed |
| `npm audit` / `--omit=dev` | 0 / 0 vulnerabilities |
| `npm audit signatures` | 115 verified attestations |
| Secret scan (tracked and untracked files, common token patterns, history search for keys/`.env`) | no matches |
| `npm run test:browser` | 26 passed / 53 failed (see above); baseline 24 / 55 |
| Docker validation | not applicable (no Docker files) |
| GitHub Actions | reviewed, not executed |

## Remaining risk and required actions

1. **Owner decisions:** SEC-12, SEC-13, SEC-23; plan the SEC-24 migration.
2. **Operational:** consider `ADMIN_REAUTH_HOURS=1–4`, `REDIS_REQUIRE_TLS=true`, forwarding logs to retained storage, release-channel verification for the egg; run the pinned workflows once.
3. **Admins** sign in again after deploying (no step-up stamp on older sessions).
4. **Browser suite:** the V2 UI owner must rewrite the 53 stale specs; until then browser tests give no regression signal.
5. No claim is made that the application is completely secure. Dynamic attack testing against a deployed instance has not been done.

## Files changed in this pass
`src/features/auth/server/config.ts`, `src/app/api/v2/admin/execute/route.ts`, `src/features/vehicles/server/load.ts`, `src/features/player/server/handler.ts`, `src/features/market/server/market-listings.ts`, `src/lib/security/rate-limit.ts`, `src/config/env.ts`, `src/app/login/page.tsx`, new `src/features/auth/notices.ts`, `scripts/deployment/build-pterodactyl-egg.mjs`, `.env.example`, `README.md`; tests: new `jwt-encode`, `notices`, `linked-character`, `seller-ids`, `roster-match`, `provider-redirect`; extended `admin`, `env`, `client-address`, `pterodactyl-egg`, browser `admin.spec`.

## Follow-up (production-readiness pass)
- **Playwright:** the 53 blocked specs were rewritten for the V2 interface against a local fake Console; the full suite is now 81 passed, 0 failed, 0 skipped. See `SECURITY_PRODUCTION_READINESS.md`.
- **SEC-12 and SEC-13:** implemented rather than accepted (durable audit trail; Console-sourced guild names).
- **SEC-23 and SEC-24:** quotas and HMAC owner keys with a rollback-capable migration implemented; the migration has not been run on production data.
- Status of every finding: `SECURITY_PRODUCTION_READINESS.md`.
