# Staging verification

Automated tests cannot cover everything that depends on your accounts and infrastructure. Do these on a **throwaway deployment that
mirrors production** (separate Redis database or instance, separate Discord application if possible, a test Pterodactyl server) before launch. Never test destructive migrations on
production data.

## Required checks

| #  | Check                                    | How                                                                                                           | Pass when |
| -- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 1  | GitHub Actions on GitHub                 | Push the branch, open a pull request, watch `CI` ([GitHub Actions](github-actions.md))                         | All jobs green, including `redis integration` and `redis cluster integration`; add the cluster job to the `verify` gate afterwards |
| 2  | Release workflow                         | Merge to `main` with a new version and changelog section                                                       | Release has archive, `.sha256` and egg; checksum verifies |
| 3  | Real Pterodactyl install                 | Import the egg, install a pinned `RELEASE_TAG`, enter hidden variables as a panel administrator                | Console prints `Arrakis Control Dashboard is listening`; Node 22 image; correct file ownership; stop and restart behave; a wrong checksum/missing asset fails the install |
| 4  | Real Discord OAuth                       | Sign in with a member and an administrator; a user without the role                                             | Member OK; role-less user refused; administrator reaches `/admin`; redirect URL exact |
| 5  | Redis authentication and TLS             | `REDIS_URL=rediss://…` with a password and `REDIS_REQUIRE_TLS=true`                                             | App starts; no Redis warnings; `redis-cli` without the password fails |
| 6  | Redis Cluster (if you use it)            | Run the integration suite against your real cluster topology; fail over a master                                | Suite green; dashboard recovers after failover |
| 7  | Console connection and scopes            | Member and admin keys with the intended scopes                                                                  | Portal, market, map, guild and admin overview all load; narrower keys fail cleanly with 403 |
| 8  | Step-up windows                          | Wait out `ADMIN_HIGH_RISK_REAUTH_MINUTES` (lower it temporarily)                                               | A destructive operation returns `ADMIN_REAUTH_REQUIRED` until you sign in again |
| 9  | Sign out everywhere                      | `DELETE /api/v2/admin/sessions` from one browser                                                                | A second browser/device is signed out on its next request |
| 10 | Audit shipping                           | Perform sign-in, failed sign-in, an admin write                                                                 | `AUDIT` lines arrive in your log platform |
| 11 | Reverse proxy                            | `TRUSTED_PROXY_COUNT` with the real topology                                                                    | Two clients do not share a rate-limit bucket; HSTS and CSP headers present |
| 12 | Backups                                  | Snapshot Redis, wipe the staging Redis, restore                                                                 | Members sign in; guild data present |
| 13 | Marketplace migration                    | `npm run marketplace:rekey` dry run, apply with `--backup`, then `--rollback` ([migration](migration.md))      | Counts match; ownership preserved; rollback exact |
| 14 | Security probes                          | Unauthenticated, cross-origin and cross-user requests against staging                                           | 401/403 as documented ([API errors](../api/errors.md)) |

## Not covered by anything automated

Load and soak testing (a k6 script exists at `tests/load/dashboard.k6.js`), dynamic scanning for XSS/SSRF, Redis crash failover and resharding under load,
and managed Redis services. Plan these separately if your community is large.

## Record the outcome

Keep a short dated note of what you ran, versions (dashboard, Console, Redis, Node), and the result. Re-run the relevant rows after upgrades
of Node, Redis, the Console or the dashboard.
