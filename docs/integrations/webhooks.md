# Discord announcements

## Purpose

The dashboard uses the main Discord bot to post Components V2 containers for release notes, development progress, and published community events. It makes server-side REST calls only; no extra bot, Gateway session, process, or webhook is required. The OAuth client secret, adapter token, and read-only bot API token retain their separate purposes.

The layout uses separate Text Display components, Separator dividers, and Action Row link buttons inside a rounded Container with a Spice accent. Every message sets `IsComponentsV2` (`32768`) and omits legacy top-level content and embeds. Combined text stays below 4,000 characters and nested components below 40, following the [discord.js display-components guide](https://discordjs.guide/legacy/popular-topics/display-components). The admin preview renders this component tree, including its dividers and buttons.

## Configure

| Variable                      | Meaning                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`           | Main bot token; server-only secret, hidden in the Pterodactyl egg                        |
| `CHANGELOG_CHANNEL_ID`        | Discord text or announcement channel for changelog posts                                 |
| `COMMUNITY_EVENTS_CHANNEL_ID` | Discord text or announcement channel for community events                                |
| `CHANGELOG_AUTO_ANNOUNCE`     | Optional automatic announcement of newly deployed releases; first run records a baseline |

Both channels must belong to `DISCORD_GUILD_ID`. Give the bot **View Channel**, **Send Messages**, and **Read Message History** in each channel. No Administrator permission or privileged Gateway intent is needed. Set the variables in the ignored production environment, restrict file access, and restart the dashboard. Use a public HTTPS `APP_URL` for announcement buttons; local HTTP origins are omitted.

## Community events

Publishing an event saves it first, then automatically posts its container. Saving later changes edits the same message. A one-minute, non-overlapping background scan starts with the dashboard and recovers known failed publications after reconnects or restarts, including the first published competition. Drafts are never announced. Unpublishing replaces an existing announcement with a generic withdrawn notice without private draft content. Deletion attempts the same notice; if that attempt fails, check the old post manually because deleted records are no longer scanned.

The admin editor reports whether Discord confirmed the post, is unconfigured, has a pending known failure, or has an unknown outcome. Saving the event still succeeds when Discord is unavailable. Competition prizes are announcements, never automatic payouts.

## Changelog

Administrators compose release or progress containers at `/admin/changelog`. The existing protected `POST /api/v2/changelog/announce` endpoint still checks same origin, administrator identity, recent sign-in, rate limits, and bounded inputs. Posts are audited. Sending the same version and kind again updates its bot-owned message; unchanged content does not cause another Discord write. Optional automatic releases preserve the existing first-run baseline behavior.

Large changelogs are sent as a numbered series of V2 messages, rather than clipping notes or omitting categories. Discord's 4,000-character text budget applies across a whole message, even when it contains several containers. The builder preserves complete bullets where possible, splits exceptionally long notes without losing text, repeats continued category headings, and stays below the text and component limits in every part. The composer previews all parts and their count. More than 50 parts is rejected before any messages are sent, with instructions to split the release; content is never silently dropped.

Redis tracks every part by version and kind. The original announcement becomes part one, later updates edit the same part IDs, and surplus parts are removed when the release becomes shorter. A renewable series lease prevents interleaved edits across administrators or instances. The tracked high-water mark survives partial failures, so a later send resumes updates and cleanup without forgetting already confirmed parts. An unknown creation still requires inspection and is never blindly posted again. Up to 50 per-part states, one manifest, and temporary locks are retained per release/kind under the same one-year expiry policy.

Migration from webhooks: `CHANGELOG_WEBHOOK_URL` is no longer used. Set the shared bot token and channel ID instead. Existing webhook messages remain untouched, because the bot cannot edit messages owned by a webhook. The first bot announcement creates a new message, using a separate Redis namespace.

## Delivery and storage

Both flows share a fixed-origin Discord client with timeouts, redirect refusal, bounded responses, empty allowed mentions, and sanitized errors. Redis locks serialize each announcement across instances. The send intent is persisted before creating a Discord message; a stable nonce provides additional short-window duplicate protection. Message IDs and payload fingerprints are retained in Redis for one year, refreshed while active community events are scanned. Temporary lock keys expire after 60 seconds. Known rejections back off; Discord rate limits pause announcements for the indicated interval.

A connection loss, server error, crash after sending, or malformed success response can leave the first creation **unknown**. It is never automatically posted again without a known message ID. Check the channel and server state before intervening; the dashboard cannot prove an external write was delivered exactly once. Existing known message IDs can safely receive later replacement edits. Do not delete Redis message state to force a retry without checking Discord for the original post.

## Security and troubleshooting

Never paste bot tokens into chat, commit them, expose them to browsers, or reuse them as OAuth/adapter credentials. Restrict production environment access and rotate the main bot token in the Discord Developer Portal if leaked. A shared bot token grants that bot's permissions, so keep its Discord roles limited.

For missing posts, check both channel IDs, the configured guild, and the bot's channel permissions. A deleted announcement is recreated on a later known-safe retry. Changing channels requires migrating the saved announcement state; mismatched stored destinations fail closed. The admin editor never reports an uncertain send as confirmed.
