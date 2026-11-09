# Integrations

| Integration                                     | Direction            | Credentials                                                                |
| ----------------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| [RedBlink Dune Docker](redblink-dune-docker.md) | Dashboard → Console  | API keys, adapter token                                                    |
| [Dune Console API](dune-console-api.md)         | Dashboard → Console  | `CONSOLE_API_KEY`, `ADMIN_CONSOLE_API_KEY`, `ADAPTER_TOKEN`                |
| [Discord](discord.md)                           | Dashboard ↔ Discord  | OAuth client ID/secret                                                     |
| [Discord announcements](webhooks.md)            | Dashboard → Discord  | `DISCORD_BOT_TOKEN`, `CHANGELOG_CHANNEL_ID`, `COMMUNITY_EVENTS_CHANNEL_ID` |
| Redis                                           | Dashboard → Redis    | See [Redis](../configuration/redis.md)                                     |
| Pterodactyl                                     | Host platform        | See [Pterodactyl](../installation/pterodactyl.md)                          |
| Bot API (inbound)                               | Your bot → Dashboard | `BOT_API_TOKEN`, see [API: server](../api/server.md#bot-world-summary)     |

The browser Content-Security-Policy allows no third-party script, connect or image origins. Discord avatars are downloaded server-side and cached in Redis; Discord remains allowed for embedded login frames.

## HetrixTools hosting report

The [Service status page](../features/dashboard.md#service-status) embeds the supplied HetrixTools report for signed-in members. Its frame origin is allowed only on `/status`; the resize helper is bundled with the dashboard. The report itself is an external service, with its own content, availability and privacy policy.
