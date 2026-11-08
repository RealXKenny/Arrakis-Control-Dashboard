# Integrations

| Integration                                         | Direction                  | Credentials                                  |
| --------------------------------------------------- | -------------------------- | -------------------------------------------- |
| [RedBlink Dune Docker](redblink-dune-docker.md)     | Dashboard → Console        | API keys, adapter token                       |
| [Dune Console API](dune-console-api.md)             | Dashboard → Console        | `CONSOLE_API_KEY`, `ADMIN_CONSOLE_API_KEY`, `ADAPTER_TOKEN` |
| [Discord](discord.md)                               | Dashboard ↔ Discord        | OAuth client ID/secret                        |
| [Webhooks](webhooks.md)                             | Dashboard → Discord        | `CHANGELOG_WEBHOOK_URL`                       |
| Redis                                               | Dashboard → Redis          | See [Redis](../configuration/redis.md)        |
| Pterodactyl                                         | Host platform              | See [Pterodactyl](../installation/pterodactyl.md) |
| Bot API (inbound)                                   | Your bot → Dashboard       | `BOT_API_TOKEN`, see [API: server](../api/server.md#bot-world-summary) |

No other third-party services are contacted: the Content-Security-Policy allows no third-party script, connect or image origins
beyond Discord's CDN for avatars (and Discord for embedded login frames).
