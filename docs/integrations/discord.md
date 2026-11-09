# Discord

## What the dashboard uses Discord for

1. **Sign-in** (OAuth2 authorization code flow), scopes `identify email guilds.members.read`. Setup: [Discord OAuth](../configuration/discord-oauth.md).
2. **Authorization:** membership of `DISCORD_GUILD_ID` and possession of `VERIFIED_MEMBER_ROLE_ID`, checked at sign-in and again
   whenever the last confirmation is older than 30 minutes, using the member's stored refresh token (sealed with a key derived from
   `AUTH_SECRET`).
3. **Avatars:** Discord profile photos are downloaded by the server and stored as image bytes in Redis. Navigation, profile pages, and chat use authenticated same-origin `/api/v2/auth/avatar/<userId>/<avatarHash>` URLs; browsers never contact the Discord CDN. Built-in game images remain local assets; uploaded guild logos and marketplace previews retain their existing Redis storage.
4. **Announcements (optional):** the main bot token and Components V2 containers ([Discord announcements](webhooks.md)).

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

## Redis avatar storage

On the first request for a missing photo, the server fetches a fixed HTTPS Discord PNG URL at 128 pixels, validates its type, signature, dimensions, and 128 KiB byte limit, and saves its base64-encoded image bytes before serving them. Inline URLs, redirects, SVG responses, and arbitrary upstream hosts are rejected. No Discord token or browser cookie is sent upstream. TLS certificate verification remains enabled.

The Redis hash and least-recently-used index share the `{avatars}` Cluster hash slot. They hold at most 512 images (roughly 86 MiB of encoded image payload at the maximum size), evicting the least recently accessed when full, and expire together after 30 days without image-cache activity. This is a bounded cache, not a permanent image archive. Existing photos remain usable during Discord outages while retained. A changed Discord avatar hash gets a new URL and cache entry; normal Discord session re-verification discovers that hash. Existing accounts populate the cache when their images are next requested.

Image requests require a current dashboard session and return private, no-store PNG responses with `nosniff` and same-origin resource protection. Cache misses are limited to 30 per member and 120 across the deployment per minute; each process allows eight simultaneous downloads and shares concurrent requests for one photo. Downloads time out after five seconds. Redis failures stop image serving safely; unavailable images use the existing UI fallback rather than redirecting the browser to Discord. The CSP allows only same-origin, data, and blob images. No new environment settings or disk files are needed; Redis persistence and backups determine survival across Redis restarts.
