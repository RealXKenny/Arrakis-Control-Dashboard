# Authentication

## Overview

Sign-in uses Auth.js v5 (`next-auth`, pinned beta) in `src/features/auth/server/config.ts`, mounted at
`src/app/api/auth/[...nextauth]/route.ts`. Two providers exist:

1. **Discord OAuth.** Scopes `identify email guilds.members.read`.
2. **Email/password (credentials).** Only for members who first signed in with Discord and then chose a password for their
   Discord-verified email. Accounts cannot be created by registering an email directly, and the email always comes from
   Discord, never from a request body.

Both providers re-check your Discord guild membership and role (`DISCORD_GUILD_ID`, `VERIFIED_MEMBER_ROLE_ID`) at sign-in.

## Sessions

- After sign-in the browser holds an Auth.js cookie named `dashboard_session` (`__Host-dashboard_session` in production)
  that contains **only an opaque session ID**. All authority (user, guild, roles, linked character, timestamps) lives in
  Redis under a SHA-256 hash of that ID (`arrakis:session:<hash>`). Cookies are `httpOnly`, `sameSite=lax`, `secure` in
  production.
- Lifetime: 30 days, ended earlier by sign-out, administrator revocation, or a failed role re-check.
- Redirects after login accept only same-site relative paths.
- Without Redis (development only) sessions live in process memory.

### Re-verification

Whenever a session's last Discord confirmation is more than **30 minutes** old, the next request re-checks the guild role
with Discord using the stored (sealed) refresh token. A definitive refusal (left the guild, lost the role) deletes the session.
If Discord is unreachable or rate limiting, a session verified within the last **6 hours** keeps working; older ones end.
A cross-instance Redis lock stops two instances from rotating the same refresh token at once. Refresh tokens are encrypted
with a key derived from `AUTH_SECRET`; **changing `AUTH_SECRET` invalidates every stored token** and everyone signs in again.

### Interactive sign-in time

`authenticatedAt` records the last *interactive* sign-in (Discord or password). Background re-verification never advances
it. Administrator step-up uses it ([administrator access](administrator-access.md)).

## Password sign-in

- Set after a first Discord login at `/setup-password` (`POST /api/v2/auth/password`): 12 to 128 characters, confirmed twice.
  Hashing is scrypt with a self-describing format.
- Sign-in budgets per 15 minutes: 10 per email, 8 per address+email, 40 per address (the per-address budget is skipped when no
  trustworthy address is available, so strangers cannot lock everyone out). Unknown emails take as long as wrong passwords.
- If your Discord email changes, the old email/password pair stops working and you choose a new password.
- A password sign-in still re-checks your guild role at Discord.

## Sign-out and revocation

Sign-out is POST-only through Auth.js. Administrators can end all of their own sessions with
`DELETE /api/v2/admin/sessions` ([sessions](../features/sessions.md)). There is no MFA.

## Configuration

`AUTH_SECRET` (32 to 256 characters), `APP_URL`, `DISCORD_*`, `VERIFIED_MEMBER_ROLE_ID`, `REDIS_URL`, `TRUSTED_PROXY_COUNT`.
See [environment variables](environment-variables.md).

## Related

[Discord OAuth](discord-oauth.md) · [Authentication security and accepted risks](../security/security-overview.md#known-limitations-and-accepted-risks) · [Discord login troubleshooting](../troubleshooting/discord-login.md)
