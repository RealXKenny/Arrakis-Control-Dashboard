# Discord login problems

Setup reference: [Discord OAuth](../configuration/discord-oauth.md), [authentication](../configuration/authentication.md).

| Symptom                                              | Likely cause                                                                                        | Fix                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Discord shows "Invalid redirect_uri"                 | Redirect URL in the portal differs from `<APP_URL>/api/auth/callback/discord`                         | Add that exact URL (scheme, host, port) to the application                               |
| Back on `/login` with an error after approving       | The member lacks `VERIFIED_MEMBER_ROLE_ID`, is not in `DISCORD_GUILD_ID`, or the IDs are wrong        | Give the role; verify both IDs; the audit shows `auth.login_failed` (`role_missing`)     |
| Sign-in loops in production                          | `APP_URL` is `http://` or differs from the browser address; the `__Host-` cookie needs HTTPS           | Serve over HTTPS with `APP_URL` equal to the public origin                               |
| Works locally, not behind the proxy                  | Proxy strips cookies/headers or rewrites `Host`/`Origin`                                              | Forward `Host`, `X-Forwarded-Proto`, `X-Forwarded-For` ([reverse proxy](../installation/reverse-proxy.md)) |
| "Server error" from Auth.js                          | `AUTH_SECRET` missing/short, or Redis unavailable (sessions cannot be stored)                          | Check startup log, [Redis errors](redis-errors.md)                                       |
| Password sign-in refused                             | No password set yet, wrong email, per-email limit (10 per 15 min), changed Discord email, or lost role | Sign in with Discord; wait out the limit; set a new password at `/setup-password`         |
| Signed out after about 30 minutes                    | Role re-check failed definitively (left the server, lost the role)                                   | Restore the role and sign in again                                                        |
| Everyone signed out after a deployment               | `AUTH_SECRET` changed, Redis wiped, or sessions older than the verification stamp                      | Expected; sign in again                                                                   |
| Administrator gets 403 on `/admin`                   | ID not in `ADMIN_DISCORD_IDS`, or step-up expired for writes (`ADMIN_REAUTH_REQUIRED`)                | [Administrator access](../configuration/administrator-access.md)                         |
| "No verified email" when setting a password          | Discord did not share a verified email                                                                | Verify the email in Discord and sign in again                                             |
| Everyone shares a rate-limit bucket                  | `TRUSTED_PROXY_COUNT` too low                                                                         | Set the exact proxy count                                                                 |

Check the audit trail for the failure reason ([audit logs](../features/audit-logs.md)); passwords and emails are never logged.
