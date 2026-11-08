# Configuration

All configuration is environment variables, validated by one module (`src/config/env.ts`). `.env.example` is the only
committed template; `.env` is git-ignored. Empty values count as unset. Malformed values stop the server without echoing them.

| Guide                                          | Covers                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| [Environment variables](environment-variables.md) | Every variable, default, range and whether production requires it       |
| [Authentication](authentication.md)            | Discord OAuth and email/password, sessions, re-verification               |
| [Discord OAuth](discord-oauth.md)              | Creating the Discord application and callback URL                          |
| [Administrator access](administrator-access.md) | `ADMIN_DISCORD_IDS`, step-up windows, risk classes                       |
| [Dune Console](dune-console.md)                | `CONSOLE_URL`, API keys, adapter token, scopes                             |
| [Redis](redis.md)                              | Standalone Redis: URLs, TLS, persistence, what is stored                   |
| [Redis Cluster](redis-cluster.md)              | `REDIS_CLUSTER_NODES`, hash tags, limits, failover                         |
| [Logging](logging.md)                          | `LOG_LEVEL`, the audit trail settings                                      |
| [Rate limiting](rate-limiting.md)              | Every limit and what tunes it                                              |

## There is no database

The project has no PostgreSQL, MySQL or SQLite. Redis is the only persistent store, so there is no database URL, migration
framework or schema to manage. (The RedBlink game stack has its own Postgres; the dashboard never connects to it.)

## Rules

- Never put secrets in `NEXT_PUBLIC_` variables.
- Keep `CONSOLE_API_KEY`, `ADMIN_CONSOLE_API_KEY`, `ADAPTER_TOKEN` and `BOT_API_TOKEN` distinct from each other and from `AUTH_SECRET`.
- `APP_URL` is the canonical public origin; do not add a separate redirect-URI variable.
- Change variables in `src/config/env.ts`, `.env.example`, tests and the README together when developing.
