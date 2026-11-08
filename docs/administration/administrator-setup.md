# Administrator setup

## Decide who administers

Administrators can change your game server through the Console (restart, restore backups, grant items, delete data). Keep the list short.

1. Collect each person's Discord user ID ([how](../getting-started/first-admin-login.md)).
2. Set `ADMIN_DISCORD_IDS=id1,id2` (required in production) and restart.
3. Each administrator must be in `DISCORD_GUILD_ID` and hold `VERIFIED_MEMBER_ROLE_ID`.
4. Configure the Console credentials: a **separate** `ADMIN_CONSOLE_API_KEY` with only the scopes your administrators need,
   and `ADAPTER_TOKEN` for adapter tools ([Dune Console](../configuration/dune-console.md)).
5. Decide the step-up windows (`ADMIN_REAUTH_HOURS` 12, `ADMIN_HIGH_RISK_REAUTH_MINUTES` 60). Shorter is safer.

## Permissions model

There is one administrator tier. There are no per-administrator scopes inside the dashboard; the scope limit is the Console key.
Use two Console keys when you want different blast radii (for example a read-only member key and a narrower admin key) and keep
destructive Console permissions off the admin key if your admins do not need them.

## Reviews

- Quarterly: compare `ADMIN_DISCORD_IDS` with who actually administers; remove leavers immediately (restart required).
- Review `admin.operation` audit events for unexpected operations ([audit logs](../features/audit-logs.md)).
- Rotate `ADMIN_CONSOLE_API_KEY` when an administrator leaves, because a removed ID loses dashboard access but any key they copied would still work against the Console.

## Offboarding an administrator

1. Remove their ID from `ADMIN_DISCORD_IDS`; restart (their next request gets 403).
2. Remove their role in Discord (their sessions end at the next re-check, within 30 minutes).
3. If they had access to environment values or the panel, rotate the affected secrets ([secrets](../security/secrets-management.md)).
4. The dashboard cannot revoke another person's sessions. Removing their ID and role is what ends their access; see [session management](session-management.md) for the blunt options.

## Not available

MFA, per-administrator scopes, and an administrator-initiated revocation of *another* member's sessions.
