# Maintenance

## Routine

| Frequency | Task                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| Daily     | Check alerts ([monitoring](monitoring.md)); confirm Redis snapshots completed                                         |
| Weekly    | Review `auth.login_failed`, `admin.access_denied`, `admin.reauth_required` events; review Dependabot pull requests (npm and GitHub Actions) |
| Monthly   | Update the dashboard to the latest verified release ([updating](../installation/updating.md)); review `ADMIN_DISCORD_IDS`; test a Redis restore |
| Quarterly | Rotate secrets that were exposed to many people; review Console API key scopes                                          |

## Rotating secrets

| Secret                    | Effect of rotating                                                                       | Procedure                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `CONSOLE_API_KEY` / `ADMIN_CONSOLE_API_KEY` | None for members; calls fail until updated                               | Create the new key in the Console, update the variable, restart, delete the old key               |
| `ADAPTER_TOKEN`           | Adapter calls fail until both sides match                                                | Change the Console token file / variable and the dashboard variable together, rebuild the Console container, restart |
| `DISCORD_CLIENT_SECRET`   | New sign-ins fail until updated                                                          | Reset in the Developer Portal, update, restart                                                    |
| `AUTH_SECRET`             | Everyone signed out; stored refresh tokens unreadable                                     | Schedule it; announce it                                                                          |
| `OWNER_KEY_SECRET`        | Existing marketplace listings lose their owners unless migrated                           | Follow [migration](../deployment/migration.md) with `OWNER_KEY_PREVIOUS_SECRET`                    |
| `BOT_API_TOKEN`           | The bot loses access                                                                      | Replace on both services, restart the dashboard                                                   |
| Redis password            | Dashboard cannot connect until `REDIS_URL` matches                                        | Change Redis `requirepass`/ACL and `REDIS_URL` together; restart both                              |

## Redis hygiene

Watch memory and evictions (`maxmemory-policy` should not evict dashboard keys silently). The audit sorted set is capped
(`AUDIT_LOG_MAX_ENTRIES`, `AUDIT_LOG_RETENTION_DAYS`); rate limit keys expire by themselves. Never `FLUSHDB` a production database.

## Marketplace

No automatic cleanup of stale listings exists. Members delete their own; there is no dashboard moderation tool. Operators can
remove listings only with Redis tooling, which must also fix the per-member counters — prefer asking the owner to delete, or
write a reviewed script (the counters and size records are maintained by Lua scripts in `src/features/bases/server/marketplace.ts`).

## Maintenance windows

There is no maintenance mode. Restarting the dashboard drops in-flight requests; members' sessions persist in Redis.
