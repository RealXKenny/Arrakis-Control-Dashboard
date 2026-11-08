# Discord

## What the dashboard uses Discord for

1. **Sign-in** (OAuth2 authorization code flow), scopes `identify email guilds.members.read`. Setup: [Discord OAuth](../configuration/discord-oauth.md).
2. **Authorization:** membership of `DISCORD_GUILD_ID` and possession of `VERIFIED_MEMBER_ROLE_ID`, checked at sign-in and again
   whenever the last confirmation is older than 30 minutes, using the member's stored refresh token (sealed with a key derived from
   `AUTH_SECRET`).
3. **Avatars:** images from `cdn.discordapp.com` (the only third-party image origin the CSP allows).
4. **Announcements (optional):** a webhook ([webhooks](webhooks.md)).

## What it does not do

The dashboard runs **no Discord bot** and has no bot token. Slash commands, the companion Discord bot, and Console broadcasts are
separate projects: the RedBlink Console includes a Discord **adapter** for an external bot
([RedBlink integration](redblink-dune-docker.md#enable-the-discord-adapter)). The dashboard's `ADAPTER_TOKEN` talks to that adapter
(for example to look up your linked character); it does not make the dashboard a bot.

## Outages and rate limits

If Discord cannot be reached during a re-check, a session confirmed within the last 6 hours keeps working; older sessions end. A
definitive refusal (left the server, lost the role) deletes the session and writes `auth.session_revoked`.

## Security

Rotate `DISCORD_CLIENT_SECRET` if exposed. Only Discord-verified emails are linked. See [authentication](../configuration/authentication.md).

## Troubleshooting

[Discord login](../troubleshooting/discord-login.md)
