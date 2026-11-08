# Sessions

## Purpose

How sign-ins persist and how they end.

## Lifecycle

1. **Creation** at interactive sign-in: a random session ID is generated, the session record (user, guild, role IDs, linked
   character, `verifiedAt`, `authenticatedAt`, `expiresAt`) is stored in Redis under `arrakis:session:<sha256(id)>` with a TTL of up
   to 30 days, and only the ID is placed in the httpOnly cookie. A fresh sign-in never inherits an old ID.
2. **Use:** each request looks the session up. If it is more than 30 minutes since Discord last confirmed the member, the dashboard
   re-checks the role ([authentication](../configuration/authentication.md#re-verification)).
3. **Update:** background updates (re-verification, setting a password) use a conditional write, so a session that was signed out or
   revoked meanwhile is **not** resurrected.
4. **End:** sign-out (POST), expiry, a failed re-check, or revocation.

## Revoking sessions

| Mechanism                         | Scope                                   | Who                                             |
| --------------------------------- | --------------------------------------- | ----------------------------------------------- |
| Sign out                          | this browser's session                  | the member                                       |
| Failed Discord re-check           | that member's session                   | automatic (`auth.session_revoked`)               |
| `DELETE /api/v2/admin/sessions`   | **all** sessions of the calling administrator | an administrator with a sign-in within the high-risk window |
| Delete the Redis keys             | one or all sessions                     | an operator with Redis access (everyone signs in again) |

"Sign out everywhere" stores a per-member marker (`arrakis:session-epoch:<sha256(user id)>`, kept 30 days, never moved backwards).
A session whose interactive sign-in is not newer than the marker is rejected and deleted on its next use, including sessions on
other devices and any background write still carrying the old sign-in time. Signing in again afterwards works immediately.
The endpoint takes no target: it can only revoke the caller's own sessions. There is **no UI button** for it yet, and no way for
one administrator to revoke another member's sessions from the dashboard.

Example (from an authenticated administrator browser console on the same origin):

```js
await fetch('/api/v2/admin/sessions', { method: 'DELETE' }).then((r) => r.json());   // { ok: true, signedOut: true }
```

## Cookie details

Name `dashboard_session` (`__Host-dashboard_session` in production: HTTPS, path `/`, no `Domain`), `httpOnly`, `sameSite=lax`.
A session cookie larger than 4096 characters or with control characters is rejected.

## Limitations

No device list, no per-session revocation, no MFA. Without Redis (development) sessions disappear on restart.

## Related

[Session management for operators](../administration/session-management.md) · [Authentication security](../security/security-overview.md)
