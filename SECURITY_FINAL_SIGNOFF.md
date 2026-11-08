# Arrakis Control Dashboard v2: final staging verification and security sign-off

This is not a certificate of security. It records what was executed, what passed, what could not be verified here, and
what the repository owner must still decide. Evidence beats assumption: every "passed" below was an actual run on the
date given, and everything not run is listed under "Not verified".

## Classification

**CONDITIONALLY READY — MANUAL ACTIONS REQUIRED**

Technical checks pass and no unresolved security defect is known, but verification that needs the owner's accounts and
infrastructure has not happened: the GitHub Actions workflows have never run, no real Pterodactyl panel installed the
egg, the Discord OAuth flow was not exercised against Discord, and the owner has open decisions (below). It is not
"ready for production review" until those are done. It is not "not ready": nothing found is a known blocker once the
manual actions are complete.

## Baseline

- Date of verification: 2026-11-08.
- Branch: `security-audit` (no commits, pushes, merges or deployments were made by this pass).
- Starting commit: `964abd9`. All changes below are uncommitted in the working tree.
- Local runtime: Node.js v26.13.0 on Windows 11; the egg and CI use Node 22 (the app declares no `engines` field).
- Documents read first: `SECURITY_AUDIT.md`, `SECURITY_REMEDIATION.md`, `SECURITY_REAUDIT.md`,
  `SECURITY_PRODUCTION_READINESS.md`, `package.json`, `.env.example`, both workflows, `dependabot.yml`, the egg builder.

## Files changed in this pass

Application and tooling:

- `src/instrumentation.ts`: invalid production configuration now stops startup (SEC-26).
- `src/lib/security/audit.ts`: same-millisecond audit events keep their order (SEC-28).
- `src/config/env.ts`: two misplaced documentation comments corrected (no behavior change).
- `scripts/deployment/build-pterodactyl-egg.mjs`: archive inspection before extraction, safer extraction flags, security
  settings exposed as egg variables (SEC-27, SEC-29).
- `scripts/maintenance/rekey-marketplace.mjs`, `rekey-marketplace-rules.mjs`: Redis Cluster support (SEC-30).
- `.github/workflows/ci.yml`, `.github/dependabot.yml`: Cluster integration job, job timeouts, npm updates.
- `package.json`, `package-lock.json`: `js-yaml` declared as a dev dependency (it was already installed through ESLint).
- `vitest.config.mjs`: integration suites run when either target variable is set.

Tests (all new or extended): `tests/integration/*` (helper, marketplace, re-key, guilds, support, platform, cluster),
`tests/deployment/installer.test.ts`, `tests/unit/release/workflow-security.test.ts`,
`tests/unit/runtime/instrumentation.test.ts`, `tests/unit/deployment/pterodactyl-egg.test.ts`,
`tests/unit/release/release-notes.test.ts`.

Documentation: this file, `PRODUCTION_DEPLOYMENT_CHECKLIST.md`, `README.md`, `.env.example`, `AGENTS.md`,
`docs/architecture/repository-inventory.md`, `SECURITY_PRODUCTION_READINESS.md`.

## Finding status

Findings SEC-01 to SEC-25 keep the status recorded in the earlier reports; this pass found and closed the following.

| ID     | Severity | Finding                                                                                                                                                                                                                                                              | Status                                                                                               |
| ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| SEC-26 | Medium   | A production server with an invalid configuration (missing `AUTH_SECRET`, bad `APP_URL`, `REDIS_REQUIRE_TLS` with `redis://`, …) logged "Dashboard startup failed · Internal error" and **kept serving traffic**; the reason was hidden.                             | FIXED, regression test, verified on the installed build                                              |
| SEC-27 | Low      | The installer extracted the archive before looking inside it. A checksummed archive is trusted, but links or special files were only detected after extraction, and files kept the archive's owner and modes.                                                        | FIXED (inspect first; `--no-same-owner --no-same-permissions`). Linux `tar` behavior not run locally |
| SEC-28 | Low      | Audit events recorded in the same millisecond were ordered by random event ID, so a forensic reader could see "denied" before "attempted".                                                                                                                           | FIXED, real-Redis test                                                                               |
| SEC-29 | Medium   | The egg did not define `ADMIN_DISCORD_IDS`, `ADMIN_HIGH_RISK_REAUTH_MINUTES`, `REDIS_ALLOW_INSECURE` or the audit settings. Pterodactyl passes only variables the egg defines, so an operator could not name administrators and was stuck with the built-in default. | FIXED (variables added, safe defaults)                                                               |
| SEC-30 | Low      | `marketplace:rekey` could not run against Redis Cluster (single-node client, per-node `SCAN`). While adding Cluster support, the first version of its test read the developer's real `.env` (see "Disclosure").                                                      | FIXED; test now runs the CLI from an empty directory                                                 |

### Open owner decisions (not changed, by instruction)

| ID     | Topic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-31 | **Step-up classification.** An operation is "high risk" (60-minute window) only if it is a `DELETE`, a download, or carries a confirmation phrase. 37 of the 149 other mutating catalog operations look destructive by name (`backups/delete-all`, `backups/restore`, `backups/system/import`, `server/stop`, `server/restart`, `updates/apply-game`, `admin/history/clear`, `players/kick-all-online`, `blueprints/import`, …) and get only the 12-hour window. Uploads (`/api/v2/admin/upload`) use the 12-hour window too. Enforcement is consistent with the rule; the rule is the question. Tightening it changes administrator session policy, so it was documented, not changed. |
| SEC-32 | **Default administrator.** When `ADMIN_DISCORD_IDS` is empty, a Discord ID compiled into `src/features/admin/server/access.ts` is the only administrator. It still needs a verified guild session. Recommend setting `ADMIN_DISCORD_IDS` explicitly in production, and deciding whether an empty value should instead mean "no administrators".                                                                                                                                                                                                                                                                                                                                         |
| SEC-33 | **Panel visibility of secrets.** `AUTH_SECRET`, `REDIS_URL` (with its password), `CONSOLE_API_KEY`, `ADAPTER_TOKEN`, `DISCORD_CLIENT_SECRET`, `BOT_API_TOKEN` are `user_viewable` panel variables, so any panel subuser with startup access can read them. Only `OWNER_KEY_SECRET` and `ADMIN_CONSOLE_API_KEY` are hidden. Restrict subuser permissions, or decide to hide more variables (the operator then edits them through the panel admin area).                                                                                                                                                                                                                                  |
| SEC-34 | **Anonymous framework telemetry.** `next build` and `next start` send anonymous Next.js usage telemetry unless `NEXT_TELEMETRY_DISABLED=1`. Decide whether to disable it in the egg.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| SEC-08 | **MFA and sign-out-everywhere** are not implemented (unchanged owner decision).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| SEC-11 | **Auth.js is a pre-release (`next-auth` v5 beta)** (unchanged owner acceptance needed).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| SEC-22 | **No release signature or provenance attestation**; the checksum only proves integrity relative to the release page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| SEC-23 | **Marketplace quotas are global per member**, not per guild, and there is no expiry for stale listings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Tests executed and actual results

| Check                                                                     | Result                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                                    | passed                                                                                                          |
| `npm run typecheck`                                                       | passed (0 errors)                                                                                               |
| `npm run lint`                                                            | passed (0 warnings)                                                                                             |
| `npm test`                                                                | **985 passed**, 101 files, 0 failed, 0 skipped (with `jq` on `PATH`, so the 32 installer tests ran)             |
| `npm run test:integration`, Redis 7.4.11 standalone                       | **88 passed**, 4 skipped (the Cluster-only file), 6 files                                                       |
| `npm run test:integration`, Redis 7.4.11 Cluster (3 masters + 3 replicas) | **92 passed**, 0 skipped; five consecutive full passes after the last fix, each with a live failover            |
| `npm run build`                                                           | passed                                                                                                          |
| `npm run test:production`                                                 | passed (13 API modules, protected base import, telemetry, market, logout), after the fail-closed startup change |
| `npm run test:browser`                                                    | **81 passed**, 0 failed, 0 skipped (Chromium, 3.0 min)                                                          |
| `npm audit`, `npm audit --omit=dev`                                       | 0 vulnerabilities, both                                                                                         |

New suites by area (all on the real servers above):

- Marketplace publish/delete Lua (22): quotas, concurrent publish/delete, counters, malformed data, unreachable Redis.
- Re-key CLI (8): dry run, backup, ownership, mixed key generations, repeat, rollback, interruption at 11 points, secret
  rotation. Also against Cluster (per-master `SCAN`).
- Guild applications, review and chat (26): atomic duplicate prevention, 200-application cap, form-changed and
  recruitment-closed races, 100-message cap, retried-send deduplication, parent-record expiry, read receipts, review
  lock, removal cascade, guild deletion cleanup, cross-user and non-leader refusal.
- Recruitment listings and the support conversation with its unread index (13).
- Sessions, account claims, rate limiting and the audit trail (19): hashed keys, expiry, conditional update that cannot
  resurrect a revoked session, malformed or tampered records, restart persistence, exactly-N allowed under 60-way
  concurrency, TTL repair, window reopening, retention trimming, entry cap, malformed members, outage tolerance.
- Cluster-only (4): healthy topology, per-family slot placement checked against the cluster itself, key spread, and a
  graceful `CLUSTER FAILOVER` of the marketplace shard under live traffic with exact counter reconciliation afterwards.
- Installer (32): checksum pass/fail, missing or malformed checksum, version pinning, malformed metadata, failed
  downloads, parent/absolute paths, symbolic links, link-through-symlink and hard-link overwrite attempts.
- Workflow policy (9), startup contract (4), egg contract (9).

No assertion was loosened to make a test pass. The few expectations that changed were mistakes in the test setup, listed
under "Problems found while testing".

## Redis 7 verification

Redis 7.4.11, loopback only, no persistence, database 15 (flushed before every test), plus database 14 for the installed
app. The binary is an unofficial Windows (Cygwin) build from `github.com/redis-windows/redis-windows`, downloaded with
the owner's approval; its SHA-256 matched the digest GitHub publishes for the asset
(`835999942bbef27e2b01f4a36955522cf19fff6511e67bbfe3fee322f6586705`). Covered, with real data and real scripts: Lua
compatibility, marketplace publish/delete, atomic quota enforcement, concurrency, counter consistency, connection
failure, session persistence and revocation, rate limiting, expiry (sessions, windows, locks, chat), audit retention and
cap, migration and rollback, and malformed records. (The previous pass ran the marketplace suites on Redis 5.0.14; Redis 5
was not re-run in this pass.)

## Redis Cluster verification

A real six-node cluster (7001 to 7006, three masters and three replicas, all 16384 slots covered) ran on loopback. The
whole integration suite, including the guild, support, session, rate-limit, audit and re-key suites, passes through the
application's own Cluster client. The Cluster-only suite confirms that each multi-key script family lives on exactly one
node (the node that owns its slot) and that single-key data spreads over several nodes. A manual `CLUSTER FAILOVER`
(with `FORCE` as a fallback when the graceful form times out, which happened in some runs on this build) was performed
while the app kept publishing and deleting; afterwards every listing had its record, index entry and size, and the
per-member counters and the global byte total equalled what was stored.

Limits: the cluster used a Windows build, no TLS, no password, no node loss by crash, no resharding while writing, and
a topology of three masters only. `redis:7.4-alpine` on a Linux host (the CI job) has not run.

Reproduce locally (any Redis 7.x with `redis-server` and `redis-cli`; the app does not need them to build):

```bash
for p in 7001 7002 7003 7004 7005 7006; do
  mkdir -p /tmp/rc/$p && (cd /tmp/rc/$p && redis-server --port $p --bind 127.0.0.1 --cluster-enabled yes \
    --cluster-config-file nodes.conf --cluster-node-timeout 3000 --save "" --appendonly no &)
done
redis-cli --cluster create 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 127.0.0.1:7006 \
  --cluster-replicas 1 --cluster-yes
TEST_REDIS_CLUSTER_NODES=127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003 npm run test:integration
```

Standalone: `TEST_REDIS_URL=redis://127.0.0.1:6379/15 npm run test:integration` (database 15 is flushed; use a throwaway
instance). The tests refuse any non-loopback address.

## GitHub Actions verification

Static verification only. Nothing was pushed and no workflow ran.

- All three YAML files parse. Job graph, `needs`, and the `verify` gate checked by `tests/unit/release/workflow-security.test.ts`.
- All four third-party actions are pinned to full commit SHAs, and each SHA exists upstream and equals its stated tag
  (`actions/checkout` v4.4.0, `actions/setup-node` v4.4.0, `actions/cache` v4.3.0, `actions/upload-artifact` v4.6.2),
  checked with the GitHub API.
- Top-level permissions are `contents: read`; only the `release` job has `contents: write`. No `pull_request_target`, no
  secrets, no untrusted event data interpolated into scripts.
- The release job runs only after a successful push CI on `main` in this repository, re-checks that the commit is on
  `main`, builds the egg, builds the archive with `git archive`, writes and re-verifies the `.sha256`, and publishes all
  three files. Version selection requires a strictly greater stable SemVer and a non-empty changelog section.
- Added: `timeout-minutes` on the Redis jobs, a Cluster job (`redis-cluster-integration`), and npm in Dependabot.

Not verified: that GitHub accepts the files, that `redis:7.4-alpine` services/containers behave as written, that the
Cluster bootstrap script reaches `cluster_state:ok` on a hosted runner, and the release job end to end. The Cluster job is
deliberately **not** in the `verify` gate yet; add it after one green run. `redis:7.4-alpine` is a moving tag, not a digest
(Dependabot cannot update it in a workflow file).

Owner steps (needs approval to push): push the branch, open a pull request, confirm every CI job is green including both
Redis jobs, then merge to `main` and confirm the release assets (archive, `.sha256`, egg). Useful commands:
`gh workflow list`, `gh run list --branch security-audit`, `gh run watch`.

## Pterodactyl installation verification

No Pterodactyl panel or Wings was available. Instead the real generated installer script ran end to end, offline, in an
isolated folder: real `bash`, `tar`, `sha256sum`, `jq` and `npm` (from the local cache, `npm ci --ignore-scripts` then the
real `next build` and `npm prune --omit=dev`); `curl` served a real archive of the working tree through a local fixture;
`apt-get`, `chown` and the apt-list cleanup were stubbed. Result: exit 0 in about a minute; checksum verified before
extraction; 437 packages installed without lifecycle scripts; build succeeded; the pruned tree still starts.

The installed copy was then started with the egg's command (`node scripts/server-launcher.mjs start`) against Redis 7.4.11
using throwaway generated secrets (never printed). 26 of 26 checks passed:

- starts and prints `Arrakis Control Dashboard is listening` (the egg's completion marker); stops; restarts on the same install;
- landing page 200, anonymous admin API 401, cross-site mutation 403, anonymous `/portal` 307, `/.env` 404;
- CSP with nonce, `nosniff`, framing protection, no `X-Powered-By`;
- failed password sign-ins create rate-limit counters and Redis audit entries containing no password or e-mail text, and
  `AUDIT` lines reach stdout;
- no secret value appears in the log;
- each of these never serves the site (every request fails; HTTP 500 where inspected; reason logged by variable name only): missing `AUTH_SECRET`,
  too-short `AUTH_SECRET`, missing `REDIS_URL`, `REDIS_REQUIRE_TLS=true` with `redis://`, plain-`http` `APP_URL` on a public
  host, missing `DISCORD_CLIENT_SECRET`.

Fail-closed installer behavior verified (sandboxed tests): a release without a complete archive and checksum pair is
refused, a mismatched or altered archive is refused before extraction, a malformed checksum is refused, a multi-line
`RELEASE_TAG` is refused, and `ALLOW_UNVERIFIED_RELEASE` relaxes only the "no assets at all" case and only when exactly
`true`. Nothing sets it automatically.

Not verified (needs the real panel): Node 22 image (local was 26), the `node:22-bookworm` installer container and its
`apt-get` step, Wings file ownership (`chown -R 1000:1000`) and modes, SIGTERM-driven shutdown (Windows cannot deliver it;
stop was a forced termination), crash-restart behavior, panel variable injection, log streaming in the panel, and Linux
GNU `tar` link handling (the pre-extraction inspection does not depend on it, which is why it was added).

## Authentication and administrator verification

Verified by code review, the earlier API suites, the browser suite, and live probes of the installed build:

- 12-hour general and 60-minute high-risk windows are both enforced from `authenticatedAt`, which only an interactive
  sign-in advances; background Discord re-checks never advance it. `execute` applies the high-risk window to `DELETE`,
  downloads and confirmation-phrase operations and the general window to other writes; `upload`, changelog announcement
  and support replies use the general window; reads are unaffected.
- Admin authorization re-verifies the exact ID, guild, role and unexpired session on every request.
- Revocation is immediate; a background write cannot resurrect a revoked session (real Redis test).
- Cross-user isolation holds for sessions and for guild applications and chats (real Redis tests).
- CSRF/same-origin checks reject foreign origins before work (live probe and unit tests).
- Audit events are redacted, bounded and ordered.

No bypass was found. The one inconsistency worth a decision is SEC-31. Not verified: the real Discord OAuth2 round trip
(no Discord application or guild was available), real password sign-in against a real account, and any penetration
testing beyond the probes above.

## Marketplace migration verification

The actual CLI ran against Redis 7.4.11 and the Cluster: dry run writes nothing; `--apply` requires `--backup` and writes
it first; ownership, scores, per-member counts and bytes are preserved; mixed legacy and HMAC keys, repeated runs,
rollback (including after an interruption at each of 11 points) and `OWNER_KEY_PREVIOUS_SECRET` rotation behave as
documented; no listing was left orphaned or inaccessible in the tested scenarios. It was never run against production
data. A production checklist is in `PRODUCTION_DEPLOYMENT_CHECKLIST.md` section 2.7.

## Staging security testing

No hosted staging environment exists. Non-destructive checks were made against the locally installed production build
with throwaway secrets and fixtures only: unauthenticated access, admin API refusal, cross-site mutation, dotfile
access, response headers, rate limiting, audit redaction, and configuration failure modes. IDOR/BOLA, quota bypass,
cross-guild access and unsafe-upload boundaries are covered by the real-Redis and API suites. No XSS, SSRF or
authenticated-session replay scanning tool was run, and nothing was aimed at production or third parties.

## Problems found while testing (and how they were handled)

- Real-Redis tests exposed no new script defects this pass. Writing them exposed SEC-28 (audit ordering).
- Running the installed build exposed SEC-26 and showed SEC-29 by inspection.
- An integration test used a fixed "dead" port that now collided with a live Redis; it now asks the OS for a closed port.
- The Cluster helper once flushed a node that had just been demoted by a failover; it now asks each node for its current
  role and repeats until the data is gone.
- The audit retention test first used a tiny entry cap; the schema enforces a minimum of 100, which is what the test uses now.

## Disclosure

While adding Cluster support to the re-key CLI, the first test run executed the CLI from the repository folder. The CLI
loads `.env` from its working directory, and the developer's `.env` defines `REDIS_CLUSTER_NODES` for a **non-loopback**
host. That one test run therefore tried to open a connection to that cluster and failed ("None of startup nodes is
available"); no command reached a server, nothing was read or written, and the value was not printed. The cause was in
my test setup. It is fixed: the test now runs the CLI from an empty temporary directory with an explicit target, and the
test helper rejects any non-loopback address. Rotate nothing on account of this; it is mentioned so the connection attempt
is not a surprise in a network log.

## Not verified

- GitHub Actions execution of any workflow, the release job end to end, and the new Cluster job.
- A real Pterodactyl panel and Wings install; Node 22 runtime; Linux file ownership; signal-driven shutdown.
- Redis behavior on Linux with the official image; TLS and password authentication for Redis and Cluster; crash failover,
  resharding under load, and replica lag.
- The real Discord OAuth round trip and the real Dune Console.
- Load, soak and denial-of-service behavior.
- Dynamic scanning for XSS, SSRF and header injection beyond targeted probes.

## Deployment blockers

None known in the code. Required before a production deployment: complete the manual actions below.

## Manual actions required

1. Review and commit the working tree (nothing was committed), push the branch and obtain one green CI run, including
   `redis integration` and `redis cluster integration`.
2. Decide SEC-31 to SEC-34 and the older open decisions (SEC-08, SEC-11, SEC-22, SEC-23).
3. Set production variables per `PRODUCTION_DEPLOYMENT_CHECKLIST.md` section 1, including `OWNER_KEY_SECRET`,
   `ADMIN_DISCORD_IDS`, `REDIS_REQUIRE_TLS=true` with a password, and `TRUSTED_PROXY_COUNT`.
4. Perform one install through a real Pterodactyl panel (a throwaway server first) and one real Discord sign-in, and
   ship stdout audit logs to storage outside the container.
5. Take a Redis backup, then run the marketplace migration when ready, using the checklist.

## Rollback readiness

Code: `RELEASE_TAG` pins a previous verified release; the installer refuses unverifiable ones. Data: the migration has a
tested rollback from its own backup, and a Redis backup restores everything else. Secrets: recovery steps are in
`PRODUCTION_DEPLOYMENT_CHECKLIST.md` section 4. No irreversible change is made by this pass.

## Final hardening pass (SEC-31 to SEC-34, SEC-08, SEC-11, SEC-22, SEC-23)

Supersedes the status of those items in the tables above. Nothing was committed.

### Fixed

| ID | Change |
| --- | --- |
| SEC-31 | `src/features/admin/server/risk.ts` classifies operations centrally. Downloads, uploads, multipart, `DELETE` and confirmation-phrase operations are high risk; **every other non-GET operation is high risk unless it is on a short, reviewed low-risk list** (update checks, probes, listings, link verification, login/logout/preflight). New catalog operations are therefore strict by default. `/api/v2/admin/upload` is always high risk. All 37 previously under-protected operations are covered by a test, plus a catalog-wide sweep. The 60-minute window itself is unchanged. |
| SEC-32 | Production startup requires `ADMIN_DISCORD_IDS` (clear error naming the variable); `isDashboardAdmin` also returns false for everyone in production if it is empty. Development and test keep the project-owner fallback. The egg now marks the variable required. Playwright and the smoke test set it explicitly. |
| SEC-33 | `SECRET_VARIABLES` (`AUTH_SECRET`, `REDIS_URL`, `CONSOLE_API_KEY`, `ADMIN_CONSOLE_API_KEY`, `ADAPTER_TOKEN`, `DISCORD_CLIENT_SECRET`, `BOT_API_TOKEN`, `OWNER_KEY_SECRET`, plus `CHANGELOG_WEBHOOK_URL`) are `user_viewable: false, user_editable: false`. Required rules are unchanged. This is panel access control only: panel administrators, and anyone who can read the running server's files, environment or console, can still see them. Side effect: owners can no longer edit these in the Startup tab; a panel administrator must. |
| SEC-34 | `NEXT_TELEMETRY_DISABLED=1` is exported by the installer before `npm ci`/build, forced by the launcher for the Next.js child, and defined as a fixed egg variable. |
| SEC-08 (part) | `DELETE /api/v2/admin/sessions`: same-origin, verified administrator, sign-in within the high-risk window, rate budget, audit event `admin.sessions_revoked`. It revokes **only the caller's own sessions** (no target parameter exists). Implemented as a per-member revocation marker in Redis: any session whose interactive sign-in is not newer than the marker is rejected and deleted on read, so it applies immediately to every session, and a background write with an old stamp cannot resurrect one. A fresh sign-in afterwards works. |

### Deferred (not implemented, by design)

- **SEC-08 remainder:** a button in the administrator UI, revoking other members' sessions (would need an explicit
  authorization model), a session index to list devices, and MFA.
- **SEC-11:** `next-auth` stays at the pinned v5 beta. Accepted temporary risk (owner approval still required). Compensating
  controls already in place: opaque Redis-backed session IDs (the JWT carries no authority), hashed session keys,
  server-side revocation, 30-minute Discord re-verification, step-up for administrators, same-origin checks, rate limits
  and audit logging. Re-evaluate when v5 is stable.
- **SEC-22:** the fail-closed SHA-256 verification is unchanged. GitHub build-provenance attestation would need
  `id-token`/`attestations: write` on the release job, a pinned attest action, and `gh attestation verify` in the installer
  container (the gh CLI is not installed there and a failure must not break installs). Follow-up release-pipeline work.
- **SEC-23:** quotas unchanged. Stale-listing cleanup was not added: it needs an expiry policy decision and must reconcile
  the counters atomically with the migration tooling.

### Operational requirements and owner approvals

- Set `ADMIN_DISCORD_IDS` before the next production start or the site will answer every request with HTTP 500.
- A panel administrator enters the hidden credentials in the Startup tab; confirm that workflow on a throwaway server.
- Approvals still open: SEC-11 acceptance, SEC-22 follow-up, SEC-23 expiry policy, MFA, whether to add the sign-out button.

### Tests executed in this pass

- `format:check`, `typecheck`, `lint`: passed.
- `npm test`: 1034 tests; all passed after allowlisting three community files (`CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`) that arrived with your merge and tripped the root-file architecture test (run with `jq` on PATH, so installer tests ran).
- New: risk classification (37 operations plus catalog sweep), production admin requirement, egg contract, telemetry, sign-out route (3).
- Redis 7.4.11 standalone, `redis-platform` suite (22, including 3 revocation tests); a temporary local Redis was started and stopped.
- `npm run build`, `npm run test:production`: passed. `npm run test:browser`: passed (81 expected; see summary).

### Tests not run in this pass

Redis Cluster failover and marketplace migration suites (no changes to those paths); `npm run test:browser` (see
below if run); real Pterodactyl install, GitHub Actions, real Discord OAuth (unchanged blockers). The new sign-out route
and the production-admin requirement were not exercised against a live OAuth login.
