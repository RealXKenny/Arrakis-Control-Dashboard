# Requirements

## Software

| Requirement | Detail                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js     | 22 or newer (the Pterodactyl egg uses the Node.js 22 image; CI uses 22). The repository declares no `engines` field, so enforce this yourself. |
| npm         | Bundled with Node.js. Installs use the committed `package-lock.json` (`npm ci`).                                                              |
| Redis       | Required in production. Redis 7.x is what the integration tests were verified against; standalone or Cluster. See [Redis](../configuration/redis.md). |
| Git         | Only to clone the repository for local development.                                                                                           |

Production installs through the Pterodactyl egg additionally need a Pterodactyl panel with Wings, outbound HTTPS to
`api.github.com` and the release download host, and enough CPU, memory and time to run a Next.js production build.

## Accounts and external services

| Item                              | Why                                                                                                         | Guide                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Discord application               | OAuth2 sign-in (client ID and secret)                                                                       | [Discord OAuth](../configuration/discord-oauth.md)       |
| Discord server and a member role  | Only members who hold `VERIFIED_MEMBER_ROLE_ID` in `DISCORD_GUILD_ID` may use the dashboard                  | [Authentication](../configuration/authentication.md)     |
| A running Dune Console            | `CONSOLE_URL` plus an API key; usually the RedBlink Dune Docker Console                                      | [Dune Console](../configuration/dune-console.md)         |
| Console API key(s)                | `CONSOLE_API_KEY` for members; optionally a separate `ADMIN_CONSOLE_API_KEY` for administrators               | [Dune Console](../configuration/dune-console.md)         |
| Console Discord adapter token     | `ADAPTER_TOKEN`, required in production                                                                      | [Dune Console](../configuration/dune-console.md#adapter-token) |
| Public HTTPS origin               | `APP_URL`; production refuses plain `http://` except for loopback                                            | [Reverse proxy](../installation/reverse-proxy.md)        |

## Network

- The dashboard server must reach the Console URL, Discord, and Redis.
- Browsers must reach the dashboard (and only the dashboard). The Console's own web UI and API port (default `8088`
  in RedBlink Dune Docker) should not be exposed to untrusted users.
- Redis must never be exposed to the internet. See [Redis security](../security/redis-security.md).

## Supported platforms

See [supported platforms](../reference/supported-platforms.md). In short: Linux and Windows for development and
direct Node.js hosting; Pterodactyl (Node.js 22 image) for managed hosting. Browser tests use Chromium.

## Sizing

The repository sets no hard sizing rules. Concurrency is bounded by `API_MAX_CONCURRENCY` (default 100) and read limits by
`API_GLOBAL_READ_LIMIT` (default 2400 per minute); the README notes that one Pterodactyl container cannot be assumed to
serve a very large community. Load-test before a large launch.
