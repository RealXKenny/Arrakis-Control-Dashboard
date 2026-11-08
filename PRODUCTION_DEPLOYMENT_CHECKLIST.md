# Arrakis Control Dashboard v2: production deployment checklist

This checklist uses only commands and settings that exist in this repository. Anything that is a general operating
practice rather than a repository feature is marked **(recommended)**. Nothing here has been run against production:
the verification evidence is in `SECURITY_FINAL_SIGNOFF.md`.

Never paste real secret values into tickets, chat or logs. Every command below that needs a secret reads it from the
environment.

## 1. Predeployment

### 1.1 Required environment variables

The server refuses to serve traffic in production unless these are present and well formed (`validateProductionEnv`
in `src/config/env.ts`, run at startup from `src/instrumentation.ts`; a failure now stops the server and logs the name
of the offending variable, never its value).

| Variable                                          | Requirement                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `APP_URL`                                         | Canonical public origin, `https://`, no path or credentials. `http://` is accepted only for loopback. |
| `AUTH_SECRET`                                     | 32 to 256 random characters. Signs Auth.js state and seals stored Discord refresh tokens.             |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`      | Discord application credentials. Callback: `<APP_URL>/api/auth/callback/discord`.                     |
| `DISCORD_GUILD_ID`, `VERIFIED_MEMBER_ROLE_ID`     | Guild and role that authorize members.                                                                |
| `CONSOLE_URL`, `CONSOLE_API_KEY`, `ADAPTER_TOKEN` | Dune Console. `CONSOLE_API_KEY` and `ADAPTER_TOKEN` must be different values.                         |
| `REDIS_URL`                                       | `redis://` or `rediss://`, optional database number. Carries the password and the TLS choice.         |

Strongly recommended settings (all optional in the schema, so they are easy to forget):

| Variable                                            | Default                    | Why set it                                                                                                                                                               |
| --------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OWNER_KEY_SECRET`                                  | derived from `AUTH_SECRET` | Dedicated HMAC secret for marketplace ownership. Set it before publishing listings you intend to keep. Changing it later orphans listings (see 2.7).                     |
| `REDIS_REQUIRE_TLS`                                 | `false`                    | `true` makes startup refuse a plain `redis://` URL.                                                                                                                      |
| `ADMIN_DISCORD_IDS`                                 | project owner's ID         | Comma-separated Discord IDs allowed into `/admin`. When empty, **a built-in default ID is the only administrator** (see owner decisions in `SECURITY_FINAL_SIGNOFF.md`). |
| `ADMIN_REAUTH_HOURS`                                | `12`                       | Step-up window for administrator changes (1 to 168).                                                                                                                     |
| `ADMIN_HIGH_RISK_REAUTH_MINUTES`                    | `60`                       | Step-up window for deletes, downloads and operations that carry a confirmation phrase (5 to 1440).                                                                       |
| `TRUSTED_PROXY_COUNT`                               | `1`                        | Number of reverse proxies in front of the app (0 to 5). Every per-address limit trusts only that forwarded entry. Use `0` with no proxy.                                 |
| `AUDIT_LOG_STDOUT`, `AUDIT_LOG_REDIS`               | `true`, `true`             | Audit trail to stdout (`AUDIT {json}` lines) and to a bounded Redis sorted set.                                                                                          |
| `AUDIT_LOG_RETENTION_DAYS`, `AUDIT_LOG_MAX_ENTRIES` | `90`, `10000`              | Retention of the Redis copy (1 to 3650 days; 100 to 1,000,000 entries).                                                                                                  |
| `REDIS_CLUSTER_NODES`                               | unset                      | Comma-separated `host:port` list. Switches the app and `marketplace:rekey` to Redis Cluster. `REDIS_URL` still supplies credentials.                                     |
| `REDIS_ALLOW_INSECURE`                              | `false`                    | Leave it `false`. `true` accepts a passwordless plain-text Redis on a public-looking host.                                                                               |
| `BOT_API_TOKEN`                                     | unset                      | 32 to 256 characters; enables the read-only bot API. Distinct from every other secret.                                                                                   |
| `ADMIN_CONSOLE_API_KEY`                             | unset                      | Separate, narrowly scoped Console key for the administrator workspace.                                                                                                   |

Pterodactyl-only (egg) variables: `RELEASE_TAG` (default `latest`; pin to an exact `vX.Y.Z`) and
`ALLOW_UNVERIFIED_RELEASE` (default `false`; leave it `false`). The egg passes only variables it defines, so a setting
that is not an egg variable cannot reach the application.

### 1.2 Secret generation

- Generate each secret independently, for example `openssl rand -base64 48` (the command `.env.example` uses).
- Never reuse a value between `AUTH_SECRET`, `OWNER_KEY_SECRET`, `BOT_API_TOKEN`, `CONSOLE_API_KEY`, `ADAPTER_TOKEN`
  and `ADMIN_CONSOLE_API_KEY`.
- Store them in the panel or secret manager only. `.env` is ignored by Git; `.env.example` is the only committed template.
- Record the date each secret was set, so a rotation can be scheduled.

### 1.3 Redis

- Redis is the only persistent store (sessions, accounts, rate limits, guild data, marketplace, audit trail). Treat it as
  production data.
- The application and the migration command have been verified against Redis 7.4.11 (standalone and a 3-master/3-replica
  cluster) on a local test build. Use a supported Redis 7.x release in production **(recommended)**.
- Require a password or ACL user and TLS. Put the credentials in `REDIS_URL` (`rediss://user:password@host:6380/0`) and
  set `REDIS_REQUIRE_TLS=true`. The app warns at startup about plain-text Redis and about a missing password.
- Do not expose Redis to the internet. Bind it to a private network and firewall it to the application host **(recommended)**.
- Persistence and replication (RDB and/or AOF, replicas) are your choice; sessions and marketplace listings are lost if
  Redis loses data **(recommended: enable persistence)**.
- Redis Cluster: all multi-key scripts use a shared `{hash tag}` per family (`{guilds}`, `{bm}`, `{audit}`), so the
  guild, marketplace and audit data each live on one shard. Single-key data (sessions, rate limits) spreads across shards.
- If the Redis you are replacing still has the pre-tag key names, follow the `redis:rekey` section of `README.md`
  **before** enabling `REDIS_CLUSTER_NODES`.

### 1.4 Network and TLS

- Terminate TLS at a reverse proxy or load balancer and set `APP_URL` to the public `https://` origin.
- Set `TRUSTED_PROXY_COUNT` to the exact number of proxies. A wrong value lets a caller spoof the address used by rate limits.
- Outbound HTTPS from the installer to `api.github.com` and the release download host is required during installation.
- The application needs reachability to the Console (`CONSOLE_URL`), Discord, and Redis only.

### 1.5 Backups

- **Before every deployment that changes data layout and before running the marketplace migration**, take a Redis backup
  with your platform's tooling (RDB snapshot or equivalent) **(recommended)**, and keep it until the change is accepted.
- `npm run marketplace:rekey -- --apply --backup <file>` also writes its own listing backup before changing anything.
  Treat that file as sensitive (it holds listing documents) and store it outside the repository.

### 1.6 Administrator access

- Decide who is an administrator and set `ADMIN_DISCORD_IDS` explicitly. Each ID must belong to `DISCORD_GUILD_ID` and
  hold `VERIFIED_MEMBER_ROLE_ID`.
- Administrators must sign in interactively (Discord or password) within the step-up windows to make changes.
- MFA and "sign out everywhere" are **not implemented**; they are listed as owner decisions in `SECURITY_FINAL_SIGNOFF.md`.

### 1.7 Release artifact verification

Each release publishes `arrakis-control-dashboard-<version>.tar.gz`, its `.sha256`, and `egg-arrakis-control-dashboard.json`.
The egg verifies the checksum itself. To verify by hand, download the archive and the `.sha256` into one folder and run:

```bash
sha256sum --check arrakis-control-dashboard-<version>.tar.gz.sha256
```

The checksum proves the archive matches what the release published; it does not prove who published it (no signature or
provenance attestation exists yet; owner decision).

Releases created before checksums were published (no archive assets) do not install. Cut a new release; do not enable
`ALLOW_UNVERIFIED_RELEASE` as a convenience.

### 1.8 Data and storage migration requirements

- Marketplace ownership keys: legacy SHA-256 keys keep working. The migration is optional but recommended (section 2.7).
- Sessions created before the verification stamp existed receive no grace and must sign in once.
- No relational database exists or is needed.

## 2. Deployment

### 2.1 Recommended sequence

1. Complete section 1 and confirm a verified Redis backup exists.
2. Merge the reviewed branch to `main` through your normal review. CI runs on the push; the release workflow tags and
   publishes only after CI succeeds on `main`.
3. Confirm the GitHub Release shows the archive, the `.sha256` and the egg.
4. Install or update on the panel (2.2), configure variables (2.3), start (2.4), verify (2.5, 2.6).
5. Run the marketplace migration only after the release is healthy (2.7).

### 2.2 Pterodactyl installation

1. Import `egg-arrakis-control-dashboard.json` from the GitHub Release into a nest.
2. Create a server on the standard Node.js 22 runtime image, assign one port. The panel supplies `SERVER_PORT`.
3. Set `RELEASE_TAG` to the release you intend to run (for example `v2.1.0`), or leave `latest` knowingly.
4. Leave `ALLOW_UNVERIFIED_RELEASE` at `false`.
5. Install. The installer downloads the archive and checksum, refuses a mismatch or a missing pair, refuses an archive with
   links or absolute/parent paths, extracts, runs `npm ci --ignore-scripts`, `npm run build`, `npm prune --omit=dev`.
6. A failed install prints the reason and leaves nothing started. Read the installation log before retrying.

### 2.3 Environment configuration

Fill every required Startup variable in the panel (section 1.1), including the strongly recommended ones. Keep secrets
hidden from subusers where the panel allows it. The egg already hides `ADMIN_CONSOLE_API_KEY` and `OWNER_KEY_SECRET`.

### 2.4 Startup

The egg runs `cd /home/container && exec node scripts/server-launcher.mjs start` (same as `npm start`). The console is
ready when it prints `Arrakis Control Dashboard is listening`. If the configuration is invalid the server stays up but
answers every request with HTTP 500 and the console shows `Production configuration is invalid; refusing to start`
followed by the variable name. Fix the variable and restart.

### 2.5 Redis connectivity validation

In the startup log expect, in order: `Runtime configuration validated`, `Redis pool configured for dashboard data`. Expect
no `REDIS_URL carries no password` or `unencrypted redis://` warning. A `Dune Console` failure at startup is logged but
does not stop the site.

### 2.6 Release and administrator verification

- `/changelog` lists the release you intended to deploy, and the installation log names the same version.
- Sign in with Discord as an administrator, open `/admin`, perform one harmless read, then confirm a write is accepted
  right after sign-in and refused with `ADMIN_REAUTH_REQUIRED` once the window has passed.

### 2.7 Marketplace migration procedure (needs owner approval; irreversible only if the backup file is lost)

Run from the application directory with the production environment loaded. `OWNER_KEY_SECRET` must already be set to
its final value.

```bash
npm run marketplace:rekey
npm run marketplace:rekey -- --apply --backup /secure/location/rekey-backup.json
npm run marketplace:rekey
```

1. The first command is a dry run: it prints how many listings would move and writes nothing.
2. The second migrates. The backup file is written before the first change. It is safe to repeat or resume.
3. The third should report `0 to migrate`.
4. Verify in the dashboard that a member can still see, update and delete their own listing.

After rotating `OWNER_KEY_SECRET`, put the old value in `OWNER_KEY_PREVIOUS_SECRET` and run the migration again; without
that, already-migrated listings become unmanageable by their owners until it is run.

## 3. Postdeployment

### 3.1 Health checks

- `GET /` returns 200. `GET /portal` anonymously redirects (307). `GET /.env` returns 404.
- `GET /api/v2/admin/overview` anonymously returns 401.
- A `POST` to any `/api/v2/**` mutation with a foreign `Origin` header is refused (403).
- Responses carry `Content-Security-Policy` with a nonce, `X-Content-Type-Options: nosniff`, and no `X-Powered-By`.

### 3.2 Authentication smoke tests

- Discord sign-in completes and lands on the portal; sign-out ends the session (POST only).
- A wrong password increments the rate limiter and produces an `auth.login_failed` audit line.
- A member removed from the guild or the role loses access within 30 minutes of their next request (re-verification).

### 3.3 Administrator permission tests

- A non-administrator member receives 403 on `/admin` and `/api/v2/admin/*`.
- An administrator whose last interactive sign-in is older than `ADMIN_REAUTH_HOURS` can read but not change.
- A destructive or download operation older than `ADMIN_HIGH_RISK_REAUTH_MINUTES` is refused (`ADMIN_REAUTH_REQUIRED`).

### 3.4 Marketplace verification

- Publish a test listing with a picture, view it, delete it, and confirm quota counters return to their previous values.
- Confirm a different member cannot delete or update it.

### 3.5 Audit logging verification

- stdout contains `AUDIT {"id":...}` lines for the sign-in, the failed sign-in and the administrator write above.
- The Redis copy is readable by an administrator at `/api/v2/admin/audit`.
- No password, token, e-mail address or request body appears in either copy.

### 3.6 Monitoring requirements

- **Ship stdout** (including `AUDIT` lines) to storage outside the container with retention that matches your policy. The
  Redis copy is bounded and is not a substitute.
- Alert on: repeated `auth.login_failed`, any `security.control_failure` event (rate limiter storage down, fail-closed),
  `admin.reauth_required`, `Production configuration is invalid`, and repeated `Dashboard startup failed`.
- Watch Redis memory, evictions, replication lag and connection errors **(recommended)**.

### 3.7 Error and performance checks

- Compare error rate and latency against the previous release for at least one full day **(recommended)**.
- Confirm the Console load does not grow unexpectedly (`API_MAX_CONCURRENCY`, `API_GLOBAL_READ_LIMIT`).

## 4. Rollback

### 4.1 Code and release rollback

1. Set `RELEASE_TAG` to the last known-good version (for example `v2.0.0`) and reinstall the server from the panel.
2. The pinned release must have its archive and `.sha256` published, or the install refuses it by design.
3. Releases are never deleted or retagged by the workflow; to withdraw a bad release, publish a newer fixed version.

### 4.2 Marketplace migration rollback

```bash
npm run marketplace:rekey -- --rollback /secure/location/rekey-backup.json
```

This restores each listing and its index entry, then recomputes the counters. It also works after an interrupted
`--apply`. Then confirm with the dry run that the legacy keys are back.

### 4.3 Redis data restoration

Restore the pre-deployment backup with your platform's tooling and restart the application. Sessions created after the
backup are lost (members sign in again); listings published after the backup are lost.

### 4.4 Secret rotation recovery

- `OWNER_KEY_SECRET` changed by mistake: restore the previous value, or set the previous value in
  `OWNER_KEY_PREVIOUS_SECRET`, and run `npm run marketplace:rekey -- --apply --backup <file>` again.
- `AUTH_SECRET` changed: every stored Discord refresh token and in-flight Auth.js state becomes unreadable. Members must
  sign in again. Restore the old value to avoid it.

### 4.5 Verification after rollback

Repeat sections 3.1 to 3.5 on the rolled-back version. Confirm the dry run shows the expected number of listings to migrate
and that members can manage their listings.
