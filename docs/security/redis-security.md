# Redis security

Redis holds sessions, accounts (password hashes, linked emails), guild data and the audit copy. Anyone who can write to it can forge
a session; anyone who can read it can read hashed password records and session contents. Treat it like a database.

## Requirements

1. **Never expose Redis publicly.** Bind it to loopback or a private interface and firewall it to the dashboard hosts.
2. **Authenticate.** Use `requirepass` or an ACL user; put the credentials in `REDIS_URL`.
3. **Encrypt in transit** whenever traffic leaves the host: `rediss://` and `REDIS_REQUIRE_TLS=true`.
4. **Dedicated instance or database** for the dashboard; do not share it with unrelated applications.
5. **Persistence and backups** with restricted access ([backups](../administration/backups.md)).
6. In Cluster mode, apply the same password/TLS to every node; `REDIS_URL` supplies them to all nodes.

## What the application enforces

- Startup refuses a plain `redis://` URL with no password to a public-looking host unless `REDIS_ALLOW_INSECURE=true` (do not set it).
- `REDIS_REQUIRE_TLS=true` refuses non-TLS URLs.
- Warnings appear for plain-text transport and missing passwords.
- Session and rate-limit keys store hashes, never raw IDs or addresses.
- If Redis is unavailable, rate limiting fails closed.

## Dangerous commands

The dashboard needs `EVAL`/`EVALSHA` (Lua), strings, hashes, lists, sorted sets, `SCAN` (re-key tools) and basic key management.
If you use ACLs, deny `FLUSHALL`, `FLUSHDB`, `CONFIG`, `DEBUG`, `KEYS` and `SHUTDOWN` for the application user. This is a hardening suggestion
(standard Redis ACL practice); verify your ACL against the integration tests ([testing](../development/testing.md#redis-integration-tests)) before relying on it.

## Verify

`redis-cli -h <host> -p 6379 ping` from an **untrusted** network position must fail; from the dashboard host with the password it must return `PONG`.

## Related

[Redis configuration](../configuration/redis.md) · [Redis Cluster](../configuration/redis-cluster.md)
