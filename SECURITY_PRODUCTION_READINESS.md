# Production Readiness — Arrakis Control Dashboard v2

Branch `security-audit`. This pass finished the outstanding remediation, restored the browser suite and re-ran every check. It does not repeat the earlier audits (see `SECURITY_AUDIT.md`, `SECURITY_REMEDIATION.md`, `SECURITY_REAUDIT.md`).

## Conclusion: CONDITIONALLY READY — MANUAL ACTIONS REQUIRED

No Critical or High issue is known. Every automated check passes, including the full browser suite (81 of 81). The application should go to a production review once the **manual actions** below are done and the **verification gap** (Lua scripts) is closed. This is not a statement that the application is completely secure: no live or dynamic attack testing has been done.

## All 25 findings and final status

| ID | Sev. | Final status | Summary |
| --- | --- | --- | --- |
| SEC-01 | Medium | FIXED | Shared "unknown address" bucket removed from password sign-in |
| SEC-02 | Low | FIXED | Read budget falls back to a per-session bucket |
| SEC-03 | Low | FIXED | Sign-out can no longer be undone by background or Auth.js writes (see SEC-15) |
| SEC-04 | Low | FIXED | Admin operations rate-limited, fail closed, audited |
| SEC-05 | Low | FIXED | No third-party CSP origins |
| SEC-06 | Low | FIXED | Console redirects refused (real-socket test) |
| SEC-07 | Low | FIXED | Cache-refresh header limited |
| SEC-08 | Medium | PARTIALLY FIXED | Admin IDs configurable; step-up sign-in 12 h for changes and 60 min for destructive actions/downloads; audit trail. **Open:** no MFA, no "sign out everywhere" (owner decision) |
| SEC-09 | Low | FIXED | Actions pinned to SHAs; Dependabot (workflows not yet run on GitHub) |
| SEC-10 | Info | PARTIALLY FIXED | Code: unauthenticated public plain-text Redis refuses to start; opt-in `REDIS_REQUIRE_TLS`; startup warnings. **Open:** deployment must use a Redis password and TLS where the network is not private |
| SEC-11 | Info | BLOCKED — owner decision | `next-auth@5.0.0-beta.32` is the newest v5 release (npm `beta` tag); no stable v5 exists and v4 lacks the App Router API. Compensating controls below. `npm audit` is 0 |
| SEC-12 | Info | FIXED | Durable audit trail (stdout JSON + bounded Redis, admin read API). Operator must ship stdout to retained storage for long-term retention |
| SEC-13 | Low | FIXED | Listings show the Console's name for the immutable guild ID; saving a different name is impossible |
| SEC-14 | Low | FIXED | Auth.js endpoints rate-limited |
| SEC-15 | Medium | FIXED | Auth.js session write-back no longer recreates signed-out sessions |
| SEC-16 | Medium | FIXED | Admin downloads need step-up (60 min) |
| SEC-17 | Medium | FIXED | Vehicles use the live character link |
| SEC-18 | Low | FIXED | Guild shown by ID match, not by name |
| SEC-19 | Low | FIXED | Seller player IDs stripped from market ladders |
| SEC-20 | Low | FIXED | IPv6 rate limits keyed by /64 |
| SEC-21 | Low | FIXED | `?error=` inherited-key crash |
| SEC-22 | Medium | PARTIALLY FIXED | Release publishes a source archive plus SHA-256; the egg verifies it before extracting or building, supports `RELEASE_TAG` pinning, `npm ci --ignore-scripts`, correct launcher path. **Open:** the checksum lives in the same release as the archive, so it detects corruption and partial tampering but not a compromised publisher; signing/provenance is an owner decision. Older releases without a checksum install with a loud warning |
| SEC-23 | Low | PARTIALLY FIXED | Per-member (24 MiB) and global (256 MiB) byte quotas added atomically next to the existing 25-per-member and 500-total counts. **Open:** expiry/cleanup and per-guild quotas need owner approval |
| SEC-24 | Low | PARTIALLY FIXED | New listings use HMAC owner keys (`OWNER_KEY_SECRET`); old keys are still accepted so nothing is orphaned. `npm run marketplace:rekey` migrates old listings (dry run default, backup file required, rollback supported, tested on representative data). **Open:** the migration has not been run on production data; until it is, pre-existing listings keep their guessable key |
| SEC-25 | Info | PARTIALLY FIXED | Player guild lookup now runs 5 rosters at a time with a 60 s shared cache. **Open (by design):** `/api/server/status` stays public (counts only, cached, rate limited) |
| New | Info | OPEN — verification gap | The Lua scripts for byte quotas and deletion (`features/bases/server/marketplace.ts`) could not be executed here (no Redis server or Lua interpreter in this environment). They were reviewed and are mirrored by a JavaScript migration tested against a fake store, but they have not run |

New findings discovered in this pass: none beyond the verification gap above. Earlier-pass findings SEC-15 to SEC-22 are included in the table.

## What changed in this pass
- **SEC-24:** `features/bases/server/owner-key.ts` (HMAC, dual-read), `marketplace.ts`, `scripts/maintenance/rekey-marketplace*.mjs`, `npm run marketplace:rekey`.
- **SEC-23:** byte quotas (`MAX_BYTES_PER_USER`, `MAX_BYTES_TOTAL`) with per-listing size records so deletes give bytes back exactly once.
- **SEC-13:** `features/guilds/server/guild-registry.ts`; `requirements.ts` saves and lists the Console name.
- **SEC-12:** `lib/security/audit.ts`, `GET /api/v2/admin/audit`, events from admin operations, step-up refusals, denied access, sign-in/out, failed password sign-ins, session revocation, guild changes, rejected origins, limiter failures.
- **SEC-08:** `ADMIN_HIGH_RISK_REAUTH_MINUTES` (default 60) for deletes, confirmed actions and downloads.
- **SEC-10:** `REDIS_ALLOW_INSECURE`, refusal of unauthenticated public plain-text Redis.
- **SEC-22:** release workflow, egg installer, `RELEASE_TAG`, tests.
- **SEC-25:** bounded, cached guild lookup.
- **Browser suite:** fake Console + per-test members; see below.

## Test results (final run, current tree)
| Check | Result |
| --- | --- |
| `npm run format:check` | passed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, `--max-warnings 0` |
| `npm test` (unit, API, security regression) | 98 files, **938 passed, 0 failed, 0 skipped** |
| `npm run build` | succeeded |
| `npm run test:production` | passed |
| `npm run test:browser` (Playwright, Chromium, 1 worker) | **81 passed, 0 failed, 0 skipped, 0 blocked** |
| `npm audit` / `--omit=dev` | 0 / 0 vulnerabilities |
| `npm audit signatures` | 115 verified attestations |
| Lockfile | 542 packages, all `registry.npmjs.org`, all with integrity hashes; `npm ls` reports no problems; one override (`minimatch@^11.0.5` for `typescript-estree`) |
| Secret scan (tracked and untracked files) | no matches |
| Deployment configuration | egg generated and shell-syntax checked (`bash -n`); egg and workflow asserted by tests; the `jq` filters in the installer and the GitHub workflows could not be executed here (`jq` absent; no Actions run) |

### Playwright restoration
The 53 failing pre-V2 specs are resolved: 81 tests pass (baseline at the start of the previous pass: 24 passed, 55 failed).
- **Cause:** the specs mocked browser-side `/api/*` calls, but V2 pages render on the server from the Console, so the mocks never applied; selectors and URLs also targeted removed pages (`/portal?view=…`).
- **Fix:** `tests/helpers/fake-console.mjs` is a local stand-in for the Console and Discord adapter, started by `browser-server.mjs`; `fake-console-client.ts` creates an isolated member (own Discord ID, character, session) per test, so caches and parallel tests cannot interfere. The browser Redis fixture now serves a recruitment listing and a pool of 5000 test sessions. The suite runs on one worker because the Console fixture is shared.
- **Per original file:** landing, market, vehicles, portal and player specs were replaced by `workspace.spec.ts` (sign-in gates, CSP, cross-origin refusal, portal/character/storage, vehicles, market, public status, credential handling, cross-member isolation). `guilds.spec.ts` and `bases.spec.ts` were rewritten for the V2 pages and API behaviour. `map.spec.ts` (8 tests) and `admin.spec.ts` were kept and updated to the V2 endpoints, URLs, sign-in and markup; two of its assertions that depended on server environment moved to a render test (`tests/unit/admin/adapter-notice.test.ts`).
- **Intentionally removed:** the Announcify test (feature removed in V2) and client-side-cache tests (reload without refetching player data, Retry-After handling in a client store), which tested behaviour that no longer exists; their security intent (no third-party origins, no cross-member leakage) is covered in `workspace.spec.ts`.
- **Limits:** guild and marketplace write flows are asserted at the browser/API boundary because the browser fixture's Redis is not a real Redis; those flows are exercised with mocks in the API tests.

## Manual actions required before go-live
1. **Set `OWNER_KEY_SECRET`** (32+ random characters) before users publish anything new. If it is left empty the key derives from `AUTH_SECRET`, and rotating `AUTH_SECRET` later would orphan newly published listings.
2. **Run the Lua scripts against a real Redis** (for example a Redis service container in CI) before relying on the new quotas and deletion; this is the one unexecuted piece of new logic.
3. **Redis:** use a password, and TLS (`rediss://`, then `REDIS_REQUIRE_TLS=true`) unless Redis is on a private network.
4. **Ship stdout to retained logging** and decide the retention period; keep `AUDIT_LOG_STDOUT=true`.
5. **Decide:** MFA/"sign out everywhere" for administrators; shorter `ADMIN_REAUTH_HOURS`; marketplace expiry and per-guild quotas; release signing/provenance; acceptance of the pre-release `next-auth`.
6. **Optional migration:** `npm run marketplace:rekey` (dry run first), then `--apply --backup <file>`, in a quiet period. Not run automatically.
7. **Run the pinned GitHub workflows once** on this branch (including the new archive/checksum step) and install an egg from a test release.
8. **Administrators sign in again** after deploying; destructive actions need a sign-in from the last hour.
9. Keep `TRUSTED_PROXY_COUNT` accurate and `APP_URL` on HTTPS.

## Compensating controls for the pre-release authentication library (SEC-11)
Auth.js only runs the OAuth handshake and CSRF token. Sessions are opaque 256-bit IDs stored in Redis under SHA-256 keys (not Auth.js JWTs); roles are re-verified with Discord every 30 minutes; the custom `jwt.encode/decode` is covered by tests; the version is pinned exactly; `npm audit` is clean. The residual risk is a library bug in an unreleased version, which only a stable v5 or a different library removes.

## Rollback
- **Code:** revert the branch; nothing in this pass changes stored data formats incompatibly.
- **Owner keys:** `npm run marketplace:rekey -- --rollback <backup>` restores records, index entries, counters and byte quotas. Without running the migration there is nothing to roll back; legacy keys remain accepted.
- **Quotas:** additive Redis keys (`arrakis:{bm}:v2:bytes:*`, `bytes-total`, `size:*`); deleting them resets quotas; the publish script ignores their absence.
- **Audit log:** set `AUDIT_LOG_STDOUT=false` and `AUDIT_LOG_REDIS=false`; delete `arrakis:{audit}:v1:events` to clear it.
- **Strictness settings:** `ADMIN_HIGH_RISK_REAUTH_MINUTES`, `ADMIN_REAUTH_HOURS`, `REDIS_REQUIRE_TLS` and `REDIS_ALLOW_INSECURE` can be changed without a code change.
- **Egg:** set `RELEASE_TAG` to a previous version to reinstall it.

## Remaining risk
Moderate and mostly operational: the unexecuted Lua scripts; Redis transport and credentials; no administrator MFA; listings published before the migration still expose a guessable key; release integrity does not defend against a compromised publisher; dynamic and load testing were not performed; React components and the 3D renderer were reviewed only for security-relevant paths.
