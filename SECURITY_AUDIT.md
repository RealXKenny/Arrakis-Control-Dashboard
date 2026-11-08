# Arrakis Control Dashboard v2 — Security Audit

Branch: `security-audit` (created from `v2`; all pre-existing uncommitted work preserved).
Date: 2026-11-07. Method: manual source review plus local automated checks. No live services were contacted and no credential was validated.

## Executive summary

**Posture: good, with no Critical or High findings.** The codebase shows consistent, deliberate hardening (opaque Redis sessions with Discord re-verification, `__Host-` HttpOnly cookies, same-origin checks on every mutation, bounded bodies, catalog-allowlisted admin operations, Lua-atomic guild workflows, strict asset allowlists, no unsafe HTML rendering, secret redaction). 14 findings were recorded; none exposes data. Status after remediation:

| Status | Findings |
| --- | --- |
| FIXED | SEC-01, 02, 03 (completed in re-audit, see SEC-15), 04, 05, 06, 07, 09, 14 |
| PARTIALLY FIXED | SEC-08 (step-up added, no MFA), SEC-10 (warning only), SEC-11 (next-auth beta) |
| BLOCKED — owner decision required (not accepted) | SEC-12, SEC-13 |
| BLOCKED / NOT REPRODUCED | none |

By original severity: Medium 2 (SEC-01 fixed, SEC-08 partial), Low 9, Info 3. See `SECURITY_REMEDIATION.md` for verification results and required operator actions.

## Scope and limitations

Inspected in full: `src/proxy.ts`, `next.config.ts`, `src/server/*`, `src/lib/security/*`, `src/lib/redis/{client,connection}.ts`, `src/lib/logger.ts`, `src/lib/http/bounded-body.ts`, `src/config/env.ts`, `src/features/auth/server/*`, `src/features/auth/{actions,schemas}.ts`, `src/features/admin/server/*`, all `src/app/api/v2/**` routes, `src/pages/api/assets`, `src/features/bot/server/world.ts`, `src/server/integrations/{discord,discord-webhook,dunedocker/transport}.ts`, `src/lib/discord-webhook-url.ts`, `src/features/guilds/server/*` (applications, chat, support, logo, requirements, membership, leader), `.github/workflows/*`, `.gitignore`, `.env.example`.

Inspected partially or by grep only (not line-by-line): map, market, vehicles, player, portal, bases/marketplace schemas and import, changelog announce, `src/instrumentation.ts`, `scripts/**` including the Pterodactyl egg generator, React components (searched for XSS sinks and unsafe links only), `tests/**`.

Not applicable: PostgreSQL and Docker/Compose. The repository contains neither (Redis is the only store; the egg runs on Pterodactyl's standard Node image). Sections 5 and 11 of the brief therefore reduce to Redis and egg/CI review.

Not performed: dynamic testing against a running server, browser tests, production smoke test, load tests, secret scanning with a dedicated tool, and live dependency review beyond `npm audit` (which uses the npm advisory database). No claim is made about areas listed as partial.

## Findings

### SEC-01 — Shared rate-limit bucket locks out password sign-in (Medium, confirmed, fixed)
- **Status: FIXED.** Root cause: shared bucket key for unknown callers. Files: `src/features/auth/server/login-limits.ts` (new), `config.ts`, `rate-limit.ts`. Verified by `tests/unit/auth/login-limits.test.ts`. Remaining risk: with no proxy header, per-address limiting is not possible in Auth.js callbacks; per-account limits still apply.
- CWE-770 / CWE-400; OWASP A04 Insecure Design.
- Files: `src/features/auth/server/config.ts` (credentials `authorize`, previously ~lines 208–222), `src/lib/security/rate-limit.ts:24-50`.
- Explanation: Auth.js `authorize` receives only a `Request`, so the address comes solely from `X-Forwarded-For`. With `TRUSTED_PROXY_COUNT=0` (the documented "no proxy" setting) or a missing header, `getClientAddress` returns `unknown`, and `auth:login:unknown` (40 attempts / 15 min) became one bucket shared by everybody.
- Prerequisites: deployment without a proxy that sets `X-Forwarded-For`, or a direct request that omits it. No credentials needed.
- Impact: any anonymous caller can deny email/password sign-in to all members for 15-minute windows. Discord sign-in is unaffected. No confidentiality impact.
- Verification: `tests/unit/auth/login-limits.test.ts` (60 distinct accounts from `unknown` all allowed; one account still limited after 8 tries).
- Remediation (done): new `src/features/auth/server/login-limits.ts` skips the shared per-address budget when the address is unknown; per-email (10) and per-address-and-email (8) budgets remain.
- Regression test: added.

### SEC-02 — V2 read budget shares one "unknown" bucket (Low, confirmed, fixed)
- **Status: FIXED.** Root cause: same shared key. Files: `src/server/read-budget.ts`. Verified by `tests/unit/server/read-budget.test.ts`. Remaining risk: none known.
- CWE-770. File: `src/server/read-budget.ts:65-80`.
- Same cause: App Router has no socket address, so with no trusted proxy every member shared a 120 reads/min bucket.
- Remediation (done): when the address is unknown the per-client bucket is keyed by the hashed session ID instead; known addresses keep the existing key.
- Test: `tests/unit/server/read-budget.test.ts`.

### SEC-03 — Session resurrection after sign-out (Low, confirmed, fixed)
- **Status: FIXED.** Root cause: unconditional whole-record write after an async call. Files: `session-store.ts`, `reverify.ts`, `redis/client.ts`, password route, player handler. Verified by two tests in `session-reverify.test.ts`. Remaining risk: a write that races a sign-out in the sub-millisecond Redis window is now dropped by `XX`, not applied.
- CWE-613 / CWE-362. Files: `src/features/auth/server/reverify.ts:101`, `src/features/auth/server/session-store.ts` (`saveSession`), `src/app/api/v2/auth/password/route.ts`, `src/features/player/server/handler.ts`.
- Explanation: re-verification reads a session, awaits Discord (up to ~10 s), then writes the whole record with `SET`. If the member signed out in that window, the write recreated the deleted session for the rest of its TTL. The same read-modify-write pattern existed in password setup and the linked-player cache.
- Prerequisites: stolen or shared session being actively used while the owner signs out; needs timing within the Discord round trip, and a re-check due (every 30 min).
- Impact: logout does not always end the session; the next re-check would normally still validate against Discord, so exposure is bounded.
- Remediation (done): `saveSession(..., { onlyIfExists: true })` uses Redis `SET ... XX`; callers that update a live session use it; re-verification returns `null` if the write was dropped.
- Tests: two cases added to `tests/unit/auth/session-reverify.test.ts`.

### SEC-04 — Admin operations unthrottled and audit lines lack target (Low, confirmed, fixed)
- **Status: FIXED.** Files: `admin/server/api-access.ts`, admin execute/upload routes, `execute.ts`. Verified by `tests/unit/admin/budget.test.ts`. Remaining risk: audit lines are console-only (SEC-12).
- CWE-770 / CWE-778. Files: `src/app/api/v2/admin/{execute,upload}/route.ts`, `src/features/admin/server/execute.ts:158`.
- Remediation (done): 300 operations/min per administrator (`spendAdminBudget`, fails closed if limiter storage is down); the "requested" audit line now records catalog-validated path identifiers (guild/player/base IDs).
- Test: `tests/unit/admin/budget.test.ts`. `tests/api/admin-catalog.test.ts` now mocks the limiter because it sweeps every operation in one minute.

### SEC-05 — CSP keeps Announcify origins and `style-src 'unsafe-inline'` (Low, potential)
- **Status: FIXED.** Root cause: leftover allowances after the widget was removed. Files: `src/proxy.ts`, `README.md`, `AGENTS.md`. Verified by a new assertion in `tests/unit/lib/proxy-csp.test.ts` (no third-party script/connect origins; only the Discord CDN for images). Remaining risk: `style-src 'unsafe-inline'` is retained for Next.js/Tailwind; the Discord frame-src remains.
- CWE-1021 / A05. `src/proxy.ts:20,21,25,26`.
- A third-party script origin (`www.announcify.app/widget.js`) is allowed although no source file uses it (grep: only `proxy.ts`). If that origin were compromised it could run on every page. `AGENTS.md` says the removal decision is pending, so it was left unchanged. `'unsafe-inline'` for styles is typical for Next/Tailwind and is much lower risk than for scripts.
- Recommendation: remove the Announcify entries from `script-src`, `connect-src`, `img-src`; add a CSP test asserting no third-party script origins.

### SEC-06 — Console provider requests follow redirects (Low, potential)
- **Status: FIXED.** Fix: `redirect: 'error'` in `dunedocker/transport.ts`, matching the admin path. Verified by the existing transport/dune tests and the full suite. Remaining risk/operational note: a Console that answers API calls with a redirect (for example http to https) will now fail; set `CONSOLE_URL` to the final URL.
- CWE-601 / A10. `src/server/integrations/dunedocker/transport.ts:69`. The admin path already uses `redirect: 'error'`; the shared transport does not. Fetch strips `Authorization` on cross-origin redirects, so credential leakage is unlikely. Not changed because a Console behind an http→https redirect may rely on it. Recommend `redirect: 'error'` after confirming deployments use the final URL.

### SEC-07 — `X-Refresh-Cache: 1` lets any member bypass the read cache (Low, potential)
- **Status: FIXED.** Fix: refresh header honoured at most 6 times per minute per session scope, in `server/api-read-cache.ts`. Verified by a new test in `tests/api/api-read-cache.test.ts`.
- CWE-770. `src/server/api-read-cache.ts:45`. Bounded by the 120/min per-IP and global read limits and the concurrency cap; each bypass costs a Console call. Consider a per-session minimum refresh interval.

### SEC-08 — Single hard-coded administrator, no step-up re-authentication (Medium, design risk)
- **Status: PARTIALLY FIXED.** Fixed parts: admin IDs are configurable (`ADMIN_DISCORD_IDS`, default unchanged), and all administrator changes (execute non-GET, uploads, announcements, admin chat replies) require an interactive sign-in within `ADMIN_REAUTH_HOURS` (default 12) via the new `authenticatedAt` session stamp. Files: `config/env.ts`, `admin/server/access.ts`, session store/config, routes, `guilds/server/support.ts`, `.env.example`, `README.md`. Verified by `tests/unit/admin/access.test.ts`, an API-level test in `tests/api/admin.test.ts`, and an admin chat test. Remaining risk: a stolen cookie can still make changes during the freshness window, there is no MFA beyond Discord, and administrators must sign in again after deployment (existing sessions have no stamp).
- CWE-306 / CWE-1390; A07. `src/features/admin/server/access.ts:8,16`.
- Admin authority is one Discord ID compiled into source, using the ordinary 30-day session. A stolen admin cookie (e.g. malware, shared machine) can run any catalog operation, including backups, restarts and guild disbanding, protected only by a typed confirmation phrase and a 30-minute Discord role re-check. Admin rotation requires a code change.
- Recommendation: move the ID (or a list) to an environment variable; require a recent interactive login (for example sessions issued within 1–4 hours) for mutating admin operations; keep the separate `ADMIN_CONSOLE_API_KEY`. Not implemented because it changes admin workflow and is an operational decision.

### SEC-09 — GitHub Actions pinned to mutable tags (Low)
- **Status: FIXED.** Fix: all workflow actions pinned to commit SHAs (looked up through the GitHub API; each tag resolved to a commit) with the version in a comment, and `.github/dependabot.yml` for weekly action updates. Verified by inspection; the workflows have not run on GitHub from this branch.
- CWE-829; A08. `.github/workflows/ci.yml:25,26,42,43,49,60`, `release.yml:22`. Workflow permissions are least-privilege (`contents: read`, `write` only for release) and the release job verifies the commit is on `main`. Recommend pinning to commit SHAs with Dependabot updates. SHAs were not invented here.

### SEC-10 — Redis transport (Info)
- **Status: PARTIALLY FIXED.** Fix: `redisTransportWarnings` (in `config/env.ts`, logged at startup from `instrumentation.ts`) warns about plain-text Redis to a public-looking host, Cluster TLS inheritance and a missing password. Verified by `tests/unit/config/redis-transport.test.ts`. Remaining risk: warning only; production does not refuse plain-text Redis, because private-network deployments are legitimate.
- `src/lib/redis/connection.ts:28`, `src/lib/redis/client.ts:50`. TLS is enabled only for `rediss://`; plaintext `redis://` is accepted in production, and in Cluster mode TLS is inherited only if `REDIS_URL` is also supplied as `rediss://`. Redis holds sessions and sealed refresh tokens. Recommend a startup warning (or refusal) for non-TLS Redis on a non-loopback host in production, and README text on Cluster TLS.
- Positive: rate limiting and sessions fail closed in production when Redis is down; refresh tokens are AES-256-GCM sealed; sessions are keyed by SHA-256 of the ID.

### SEC-11 — Dependencies (Info)
- **Status: PARTIALLY FIXED.** Fix: `vitest` and `@vitest/coverage-v8` upgraded to 5.1.0 and an npm `overrides` entry moves `typescript-estree` to `minimatch@^11.0.5`. `npm audit` now reports 0 vulnerabilities (production and full). Verified by lint, typecheck and the full suite on the new tree. Remaining risk: `next-auth` is still the `5.0.0-beta.32` pre-release (upstream decision); install scripts and typosquatting were not individually reviewed.
- `npm audit --omit=dev`: 0 vulnerabilities. Full `npm audit`: 11 moderate, all in dev tooling (`vitest`/`@vitest/mocker` advisories GHSA-qxg6-89mg-rqv8 and GHSA-xp26-3454-mjgp; `minimatch` GHSA-g3hv-75wg-m249 via `typescript-eslint`/`eslint-config-next`). The suggested "fix" is a semver-major downgrade of `eslint-config-next`, so it was not applied. `next-auth` is the `5.0.0-beta.32` pre-release; track upstream stable. Install scripts and typosquatting were not individually reviewed.

### SEC-12 — Audit trail is console-only (Info)
- **Status: BLOCKED — owner decision required (not accepted).** No code change: the project deliberately has no log files. Needs owner approval to accept; forward process output to retained storage for investigations.
- By project design there are no log files, so admin and permission-change events exist only in process output. Forward container/process logs to retained storage if incident investigation is needed. Request IDs are validated and propagated (`proxy.ts`, `pages-api.ts`).

### SEC-13 — Guild listing name is leader-supplied (Low, unverified)
- **Status: BLOCKED — owner decision required (not accepted).** Not changed: the display name is free-form text on a listing bound to the verified guild ID, so applications always reach the verifying leader's own inbox; the risk is social engineering only. Needs owner approval to accept, or a decision to pull the authoritative guild name from Console.
- `src/features/guilds/server/requirements.ts:428`. A verified leader of one guild can publish a listing whose display name imitates another guild. I did not check whether the schema compares it to the Console guild name; treat as an unverified business-logic concern.

### SEC-14 — No IP rate limit on Auth.js OAuth routes (Low, unverified)
- **Status: FIXED.** Fix: per-address ceiling (120/min) on Auth.js routes in `features/auth/server/endpoint-limit.ts`, applied in the route file; skipped for unknown addresses; fails closed with 503 if limiter storage is down in production. Verified by `tests/unit/auth/endpoint-limit.test.ts`.
- `src/app/api/auth/[...nextauth]/route.ts`. Credentials attempts are limited in `authorize`; sign-in/callback requests are otherwise unlimited. Each OAuth callback calls Discord. Not exploited or measured.

## Verified-good controls (spot-checked in code)
- OAuth: Auth.js state/PKCE handling, `AUTH_URL` fixed to `APP_URL` in production, scope limited to `identify email guilds.members.read`, email only from Discord-verified address, email claim is first-writer-wins.
- Sessions: fresh session ID per login (no fixation), cookie `__Host-` + HttpOnly + Secure + SameSite=Lax in production, deletion on definitive Discord refusal.
- CSRF: `assertSameOrigin` (v2) and `isSameOriginRequest` (legacy) on every mutation; legacy guild mutation handlers all call `requireGuildMutationOrigin`.
- Authorization: guild mutations and application inboxes require a freshly verified role-100 leader of that exact guild; applicant IDs are derived from `sha256(guildId:discordId)` so cross-user access by ID is not possible; admin routes re-check admin ID, guild, role and expiry server-side.
- Injection/SSRF/traversal: no SQL; Lua scripts parameterised; provider URLs built from the catalog with percent-encoded, regex-validated segments and origin check; webhook URL allowlist; asset route is a strict allowlist with `path.resolve` containment.
- Input bounds: bounded body reader counts the stream, admin request depth/size/field limits, prototype-key rejection, chat/application caps.
- Secrets: `.env` untracked and ignored; no real secrets in `.env.example` or git history search for `CONSOLE_API_KEY=`; logger and admin sanitiser redact secrets.

## Remaining roadmap
1. Owner decisions: accept or act on SEC-12 (log retention) and SEC-13 (listing names).
2. SEC-08: consider MFA or a shorter `ADMIN_REAUTH_HOURS`; track next-auth stable (SEC-11).
3. Complete the partially inspected areas listed under Scope (map, market, vehicles, player, bases import, egg script, UI components).
4. Run the GitHub workflows on the branch to confirm the SHA-pinned actions resolve.

## Re-audit addendum (independent second pass)
A fresh adversarial pass is recorded in `SECURITY_REAUDIT.md`. It corrected two earlier conclusions and added findings; historical text above is unchanged.
- SEC-03: the earlier fix was incomplete; Auth.js re-encodes the session on every read and recreated deleted sessions. Completed under SEC-15 (FIXED, test `jwt-encode.test.ts`).
- SEC-08: admin downloads (backups, exports, logs) bypassed the step-up check. Fixed under SEC-16. Status stays PARTIALLY FIXED (no MFA; 12 h default window).
- SEC-10: opt-in `REDIS_REQUIRE_TLS` added; status stays PARTIALLY FIXED.
- SEC-11: independently re-verified (lockfile, signatures, scripts); stays PARTIALLY FIXED because `next-auth` is a beta.
- SEC-12 and SEC-13: no longer described as accepted; both are BLOCKED pending an explicit owner decision.
- New: SEC-15 to SEC-25 (see the re-audit report): SEC-15 to SEC-22 FIXED; SEC-23, SEC-24, SEC-25 OPEN.
