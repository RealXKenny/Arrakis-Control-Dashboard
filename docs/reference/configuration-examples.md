# Configuration examples

All values are placeholders. Generate secrets with `openssl rand -base64 48`. Never commit a real `.env`.

## Local development

```dotenv
SERVER_HOSTNAME=127.0.0.1
SERVER_PORT=2008
APP_URL=http://127.0.0.1:2008
AUTH_SECRET=<32+ random characters>
DISCORD_CLIENT_ID=<id>
DISCORD_CLIENT_SECRET=<secret>
DISCORD_GUILD_ID=<server id>
VERIFIED_MEMBER_ROLE_ID=<role id>
CONSOLE_URL=http://127.0.0.1:8088
CONSOLE_API_KEY=<member key>
ADAPTER_TOKEN=<adapter token>
# Optional in development: ADMIN_DISCORD_IDS (defaults to the project owner), REDIS_URL (memory fallback)
ADMIN_DISCORD_IDS=<your discord user id>
```

## Production, one host, standalone Redis, one proxy

```dotenv
SERVER_HOSTNAME=127.0.0.1
SERVER_PORT=2008
TRUSTED_PROXY_COUNT=1
APP_URL=https://dashboard.example.com
AUTH_SECRET=<48+ random characters>
OWNER_KEY_SECRET=<separate random value>
DISCORD_CLIENT_ID=<id>
DISCORD_CLIENT_SECRET=<secret>
DISCORD_GUILD_ID=<server id>
VERIFIED_MEMBER_ROLE_ID=<role id>
ADMIN_DISCORD_IDS=<id1>,<id2>
CONSOLE_URL=http://127.0.0.1:8088
CONSOLE_API_KEY=<member key>
ADMIN_CONSOLE_API_KEY=<separate admin key>
ADAPTER_TOKEN=<adapter token>
REDIS_URL=redis://:<password>@127.0.0.1:6379/0
AUDIT_LOG_STDOUT=true
LOG_LEVEL=INFO
```

## Production behind Cloudflare and Nginx, Redis over TLS

```dotenv
TRUSTED_PROXY_COUNT=2
APP_URL=https://dashboard.example.com
REDIS_URL=rediss://:<password>@redis.internal.example.com:6380/0
REDIS_REQUIRE_TLS=true
CONSOLE_URL=https://console.internal.example.com
# …all other required variables as above
```

## Redis Cluster

```dotenv
REDIS_URL=rediss://:<password>@10.0.0.11:6379
REDIS_CLUSTER_NODES=10.0.0.11:6379,10.0.0.12:6379,10.0.0.13:6379
REDIS_REQUIRE_TLS=true
```

## Pterodactyl

Enter the same values as panel variables ([Pterodactyl](../installation/pterodactyl.md#variables)). Do not set `SERVER_PORT` (Wings supplies it).

## Marketplace migration after rotating the owner secret

```dotenv
OWNER_KEY_SECRET=<new secret>
OWNER_KEY_PREVIOUS_SECRET=<old secret>
```

then `npm run marketplace:rekey -- --apply --backup <file>` ([migration](../deployment/migration.md)).

## Read-only bot API

```dotenv
BOT_API_TOKEN=<32 to 256 random characters, not reused anywhere>
```
