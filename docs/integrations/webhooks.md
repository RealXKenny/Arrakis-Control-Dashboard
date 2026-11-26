# Discord announcements

## Purpose

The dashboard uses the main Discord bot to post Components V2 containers for published community events. It makes server-side REST calls only; no extra bot, Gateway session, process, or webhook is required. The OAuth client secret, adapter token, and read-only bot API token retain their separate purposes.

The layout uses separate Text Display components, Separator dividers, and Action Row link buttons inside a rounded Container with a Spice accent. Every message sets `IsComponentsV2` (`32768`) and omits legacy top-level content and embeds. Combined text stays below 4,000 characters and nested components below 40, following the [discord.js display-components guide](https://discordjs.guide/legacy/popular-topics/display-components). The admin preview renders this component tree, including its dividers and buttons.

## Configure

| Variable                      | Meaning                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`           | Main bot token; server-only secret, hidden in the Pterodactyl egg |
| `COMMUNITY_EVENTS_CHANNEL_ID` | Discord text or announcement channel for community events         |

The channel must belong to `DISCORD_GUILD_ID`. Give the bot **View Channel**, **Send Messages**, and **Read Message History** in it. No Administrator permission or privileged Gateway intent is needed. Set the variables in the ignored production environment, restrict file access, and restart the dashboard. Use a public HTTPS `APP_URL` for announcement buttons; local HTTP origins are omitted.

## Community events

Publishing an event saves it first, then automatically posts its container. Saving later changes edits the same message. A one-minute, non-overlapping background scan starts with the dashboard and recovers known failed publications after reconnects or restarts, including the first published competition. Drafts are never announced. Unpublishing replaces an existing announcement with a generic withdrawn notice without private draft content. Deletion attempts the same notice; if that attempt fails, check the old post manually because deleted records are no longer scanned.

The admin editor reports whether Discord confirmed the post, is unconfigured, has a pending known failure, or has an unknown outcome. Saving the event still succeeds when Discord is unavailable. Competition prizes are announcements, never automatic payouts.

## Changelog

The dashboard no longer posts changelogs to Discord. The Arrakis Control bot is the only changelog publisher: it reads `GET /api/v2/changelog` (see [public changelogs](../features/public-changelogs.md)), posts each bot and dashboard release once, and labels every post with its product. `CHANGELOG_CHANNEL_ID` and `CHANGELOG_AUTO_ANNOUNCE` were removed; unset them after upgrading. Changelog messages the dashboard posted earlier stay in Discord untouched, and their Redis state under `arrakis:{cl}:v2` is no longer read and can be removed.

## Delivery and storage

Announcements use a fixed-origin Discord client with timeouts, redirect refusal, bounded responses, empty allowed mentions, and sanitized errors. Redis locks serialize each announcement across instances. The send intent is persisted before creating a Discord message; a stable nonce provides additional short-window duplicate protection. Message IDs and payload fingerprints are retained in Redis for one year, refreshed while active community events are scanned. Temporary lock keys expire after 60 seconds. Known rejections back off; Discord rate limits pause announcements for the indicated interval.

A connection loss, server error, crash after sending, or malformed success response can leave the first creation **unknown**. It is never automatically posted again without a known message ID. Check the channel and server state before intervening; the dashboard cannot prove an external write was delivered exactly once. Existing known message IDs can safely receive later replacement edits. Do not delete Redis message state to force a retry without checking Discord for the original post.

## Security and troubleshooting

Never paste bot tokens into chat, commit them, expose them to browsers, or reuse them as OAuth/adapter credentials. Restrict production environment access and rotate the main bot token in the Discord Developer Portal if leaked. A shared bot token grants that bot's permissions, so keep its Discord roles limited.

For missing posts, check both channel IDs, the configured guild, and the bot's channel permissions. A deleted announcement is recreated on a later known-safe retry. Changing channels requires migrating the saved announcement state; mismatched stored destinations fail closed. The admin editor never reports an uncertain send as confirmed.
