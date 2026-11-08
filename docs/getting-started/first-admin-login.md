# First administrator login

## Overview

Administrator rights come only from the server-verified session: your Discord user ID must be listed in
`ADMIN_DISCORD_IDS`, you must belong to `DISCORD_GUILD_ID`, and you must hold `VERIFIED_MEMBER_ROLE_ID`. Nothing a
browser sends can grant it. See [administrator access](../configuration/administrator-access.md).

## Steps

1. **Find your Discord user ID.** In Discord enable *Settings → Advanced → Developer Mode*, right-click your name and
   choose *Copy User ID* (a number of up to 25 digits).
2. **Set `ADMIN_DISCORD_IDS`** to that ID (comma-separate several). In production this is required; startup fails
   without it. Restart the dashboard after changing it.
3. **Open the dashboard** and choose **Sign in with Discord**. Approve the scopes `identify`, `email` and
   `guilds.members.read`.
4. After the callback you land on `/post-login`. If Discord shared a verified email and you have no password yet, you
   are sent to `/setup-password` to choose one (12 to 128 characters). This enables email/password sign-in later; Discord
   sign-in always keeps working.
5. Open **Administration** (`/admin`). The *Overview* tab shows which credentials are configured: the separate
   `ADMIN_CONSOLE_API_KEY` and the `ADAPTER_TOKEN`.

## Step-up re-authentication

Reading in `/admin` works with any valid session. **Changes** need an interactive sign-in recent enough:

| Action type                                                                      | Window                                         |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| Any mutating operation, upload or download (see [risk classes](../features/administrator-panel.md#step-up-re-authentication)) | `ADMIN_HIGH_RISK_REAUTH_MINUTES` (default 60) |
| A small reviewed set of checks/probes, announcements, support replies            | `ADMIN_REAUTH_HOURS` (default 12)             |

When the window has passed the API answers `403 ADMIN_REAUTH_REQUIRED`; sign in again and repeat the action.

## Verify

- `/admin` loads; a non-administrator account gets `403`.
- Run one harmless read operation from the catalog.
- After signing in again, the audit trail contains `auth.login` ([audit logs](../features/audit-logs.md)).

## Troubleshooting

[Discord login problems](../troubleshooting/discord-login.md) · [Administrator access](../configuration/administrator-access.md#troubleshooting)
