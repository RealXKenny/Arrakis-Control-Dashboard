# Discord OAuth

## Overview

The dashboard signs members in with Discord OAuth2 and uses Discord to decide who may enter: the member must be in your server
(`DISCORD_GUILD_ID`) and hold your member role (`VERIFIED_MEMBER_ROLE_ID`).

## Requirements

A Discord account that can manage your server and the [Discord Developer Portal](https://discord.com/developers/applications).

## 1. Create the application

1. Developer Portal → **New Application**. Copy the **Application ID** → `DISCORD_CLIENT_ID`.
2. *OAuth2* → **Reset Secret** (or copy it) → `DISCORD_CLIENT_SECRET`. Treat it like a password.
3. *OAuth2 → Redirects* → add exactly:

   ```text
   <APP_URL>/api/auth/callback/discord
   ```

   For example `https://dashboard.example.com/api/auth/callback/discord`, or `http://127.0.0.1:2008/api/auth/callback/discord`
   locally. The callback is derived from `APP_URL` in code (`getDiscordRedirectUri`); there is no separate redirect variable.
   The scheme, host and port must match `APP_URL` exactly.
4. You do **not** need a bot user for sign-in. The dashboard requests the scopes `identify email guilds.members.read`.

## 2. Find the IDs

Enable Developer Mode in Discord (*Settings → Advanced*), then right-click to copy:

| Value                   | Where                                   | Variable                  |
| ----------------------- | --------------------------------------- | ------------------------- |
| Server (guild) ID       | Right-click the server icon             | `DISCORD_GUILD_ID`        |
| Member role ID          | *Server Settings → Roles* → right-click | `VERIFIED_MEMBER_ROLE_ID` |
| Your user ID            | Right-click your name                   | `ADMIN_DISCORD_IDS`       |

## 3. Configure and restart

Set the variables ([environment variables](environment-variables.md)), restart, and sign in. New members should hold the member role
*before* they sign in; a missing role is refused and audited (`auth.login_failed` with reason `role_missing`).

## Verify

Sign in with a member account → Discord consent screen → back on the portal. Sign in with an account that lacks the role →
refused on the login page.

## Security

- Keep `DISCORD_CLIENT_SECRET` out of Git, logs and tickets; rotate it in the portal if it leaks, then update the variable and
  restart (members stay signed in; only new sign-ins use the new secret).
- Only a Discord-**verified** email can become a login email.
- Roles are re-checked at least every 30 minutes ([authentication](authentication.md#re-verification)).

## Troubleshooting

| Symptom                                       | Check                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Discord says "Invalid redirect_uri"           | The redirect in the portal differs from `<APP_URL>/api/auth/callback/discord`              |
| Back on `/login` with an error                | Member lacks the role, wrong `DISCORD_GUILD_ID`, or `VERIFIED_MEMBER_ROLE_ID`              |
| Sign-in loops in production                   | `APP_URL` is `http://` or differs from the browser's address (`__Host-` cookie needs HTTPS) |
| Startup 500: `DISCORD_CLIENT_SECRET` missing  | Set both client variables ([startup errors](../troubleshooting/startup-errors.md))          |

More: [Discord login troubleshooting](../troubleshooting/discord-login.md).
