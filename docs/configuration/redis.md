# Redis

## Overview

Redis (via `ioredis`) is the dashboard's **only** persistent store. There is no relational database. Production refuses to
start without `REDIS_URL`. Redis can be a single node (this page) or a Cluster ([Redis Cluster](redis-cluster.md)).

## What is stored

| Data                         | Key pattern (prefix)                                    | Notes                                                                      |
| ---------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Sessions                     | `arrakis:session:<sha256>`                              | 30 days; the cookie holds only the opaque ID                                |
| Session revocation markers   | `arrakis:session-epoch:<sha256 of user id>`             | Written by "sign out everywhere"                                            |
| Accounts and email claims    | `arrakis:auth:user:<discordId>`, `arrakis:auth:email2:<hash>`, `arrakis:auth:reverify:<discordId>` | Password hash, linked email, re-verification lock |
| Rate-limit counters          | `arrakis:rate:<sha256>`                                 | One counter per key and window; always has a TTL                            |
| Audit trail                  | `arrakis:{audit}:v1:events`                             | Sorted set, trimmed by age and count                                         |
| Guild data                   | `arrakis:{guilds}:…`                                    | Listings, applications, chats, support threads, logos                        |
| Base marketplace             | `arrakis:{bm}:v2:…` (and legacy `arrakis:{bm}:v1:…`)    | Listings, pictures, per-member counters                                      |
| Base-import ledger           | `arrakis:{solido:<owner>}:history:<day>` / `operation:<id>` | Per-member                                                               |
| Read caches, snapshots       | `arrakis:read:v1:…`, `arrakis:dashboard:snapshot`, `arrakis:population:…` | Rebuilt from the Console                                      |

Losing Redis signs everyone out and deletes guild data, marketplace listings and the Redis copy of the audit trail. Treat it as
production data and [back it up](../administration/backups.md).

## Connection URL

```text
redis://[user]:password@host:6379/0      plain text (loopback or a private network only)
rediss://[user]:password@host:6380/0     TLS
```

Rules (schema): protocol `redis:` or `rediss:`, a host, an optional database number path, **no** query string or fragment.
Percent-encode special characters in the password. Cluster mode ignores the database number.

## Standalone setup (example)

Standard Redis configuration, not specific to this project: bind to loopback or a private interface, require a password, keep
persistence on.

```conf
bind 127.0.0.1
protected-mode yes
requirepass <LONG_RANDOM_PASSWORD>
appendonly yes
```

Then `REDIS_URL=redis://:<LONG_RANDOM_PASSWORD>@127.0.0.1:6379/0`. For remote Redis use TLS (`rediss://`) and set
`REDIS_REQUIRE_TLS=true` so production refuses a plain URL.

## What production enforces

- Plain `redis://` without a password to a public-looking host is refused unless `REDIS_ALLOW_INSECURE=true`.
- `REDIS_REQUIRE_TLS=true` requires `rediss://`.
- Warnings are logged for plain-text Redis to a public-looking host and for no password.
- If Redis is down, the request rate limiter **fails closed** (HTTP 503 `RATE_LIMIT_UNAVAILABLE`) and records a
  `security.control_failure` audit event; the connection retries forever with capped, jittered backoff and the next request
  after recovery works.

## Persistence, backup and restore

Enable AOF and/or RDB on the server and snapshot it; the dashboard holds nothing outside Redis. See
[backups](../administration/backups.md) and [disaster recovery](../administration/disaster-recovery.md).

## Verify

```bash
redis-cli -u "$REDIS_URL" ping           # PONG
```

Startup logs `Redis pool configured for dashboard data`. After one sign-in you will find `arrakis:session:*` keys.

## Security

Never expose Redis to the internet. See [Redis security](../security/redis-security.md).

## Maintenance

Flushing a database logs everyone out and removes all dashboard data. Do not share a Redis database with other applications.
Tooling for key layout changes: `npm run redis:rekey` (legacy single-node key renaming, run before moving to Cluster) and
`npm run marketplace:rekey` ([migration](../deployment/migration.md)).

## Troubleshooting

[Redis errors](../troubleshooting/redis-errors.md)
