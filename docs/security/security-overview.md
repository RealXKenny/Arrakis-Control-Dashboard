# Security overview

## Trust boundaries

| Boundary                         | Rule                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Browser ↔ dashboard              | HTTPS; authority only from the server-side session; no secrets or provider responses sent to browsers             |
| Dashboard ↔ Console              | Bearer credentials on the server; narrow scopes; separate admin key; allowlisted operation catalog                 |
| Dashboard ↔ Redis                | Password/TLS; Redis never public; keys hashed or hash-tagged                                                       |
| Dashboard ↔ Discord              | OAuth2 + role re-verification every 30 minutes                                                                     |
| Release ↔ installation           | SHA-256-verified archive, fail-closed installer                                                                    |

## Controls in place (verified by tests)

- **Sessions:** opaque ID in an httpOnly cookie, record in Redis under a hashed key, 30-day cap, conditional writes (no
  resurrection), per-member revocation marker, Discord re-verification with a 6-hour outage grace.
- **Authorization:** exact-ID administrator check on every request; step-up re-authentication with an explicit high-risk
  classification that is strict by default; same-origin checks on every mutation; confirmation phrases for catalog writes.
- **Production fails closed:** invalid configuration serves nothing; `ADMIN_DISCORD_IDS` is mandatory; the rate limiter denies
  when Redis is down.
- **Inputs:** bounded bodies and uploads, strict zod schemas, prototype-key rejection, picture content-sniffing, allowlisted
  asset paths, URL-encoded IDs, unsafe-size numbers kept as strings.
- **Output:** per-request nonce CSP, HSTS, `nosniff`, `X-Frame-Options: DENY`, `no-store` API responses, recursive secret
  redaction in logs, safe error bodies with request IDs.
- **Marketplace:** HMAC owner keys, atomic quotas (25 listings / 24 MiB per member, 500 / 256 MiB total), duplicate-publish refusal.
- **Audit:** redacted, bounded, ordered events to stdout and Redis ([audit logs](../features/audit-logs.md)).
- **Supply chain:** workflow actions pinned to commit SHAs, read-only workflow tokens (write only in the release job), Dependabot for npm and
  GitHub Actions, `npm audit` clean at the last check.
- **Pterodactyl:** credential variables hidden from owner/subusers, telemetry off, installer inspects archives before extraction.

## Known limitations and accepted risks

These were open at the end of the security pass. They are **operational facts**, not hidden defects; revisit them before launch.

| Topic                                  | Status                                                                                                                                                                                                  | What to do                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **No multi-factor authentication**     | Sign-in is Discord OAuth or email/password. Administrator step-up needs a recent interactive sign-in but no second factor.                                                                              | Enable 2FA on the Discord accounts of every administrator; owner decision whether to build MFA |
| **"Sign out everywhere" has no UI**    | The API exists (`DELETE /api/v2/admin/sessions`, own sessions only). No device list, no per-session revocation, no administrator revocation of other members.                                           | Use the API when needed; owner decision on UI                                                |
| **Auth.js is a pre-release (`next-auth` v5 beta)** | Pinned deliberately; migration is risky. **Accepted temporary risk requiring owner approval.** Compensating controls: the cookie carries only an opaque ID (no authority in the token), hashed server-side sessions with revocation, 30-minute role re-verification, administrator step-up, same-origin checks, rate limits, audit logging. | Re-evaluate when v5 is stable; watch advisories for `next-auth` and `@auth/core` |
| **No release signing / provenance**    | Releases publish a SHA-256 checksum that proves integrity relative to the release page, not publisher identity. GitHub build-provenance attestation was not added (needs release-job permissions and `gh` in the installer container). | See [release verification](release-verification.md); owner decision                           |
| **Marketplace retention**              | Quotas are per member and global, not per guild. No automatic expiry or cleanup of stale listings; no moderation tool.                                                                                  | Owner decision on expiry policy before the marketplace grows                                  |
| **Secrets visible to panel admins**    | Hidden egg variables are still readable by panel administrators and by anyone with file, environment or console access to the running server.                                                          | Limit panel admins; [secrets management](secrets-management.md)                              |
| **Observability**                      | No metrics endpoint; audit retention in Redis is bounded                                                                                                                                                | Ship stdout; [monitoring](../administration/monitoring.md)                                   |
| **Dependency posture**                 | Dependency risk is tracked through Dependabot and `npm audit`; the Redis CI image is a moving tag (`redis:7.4-alpine`)                                                                                  | Review updates; pin by digest if your policy requires it                                      |

## What was verified, and what was not

Verified locally in isolated environments: unit and API tests, browser tests, a production build and smoke test, the Redis scripts
against Redis 7.4 (standalone and a 3-master/3-replica Cluster including a live failover), the marketplace migration and rollback,
the sandboxed installer, and the installed build's start, stop, restart and fail-closed behaviour.

**Not verified:** GitHub Actions runs on GitHub (including the Redis and Cluster jobs and the release job end to end), a real Pterodactyl
panel with Wings (Node 22, file ownership, signal-driven shutdown), the real Discord OAuth2 round trip, Redis TLS and password
authentication, crash failover and resharding under load, load/soak behaviour, and dynamic scanning (XSS, SSRF). The checks you must
do before launch are in [staging](../deployment/staging.md).

## Related

[Production hardening](production-hardening.md) · [Authentication](../configuration/authentication.md) · [Administrator access](../configuration/administrator-access.md)
