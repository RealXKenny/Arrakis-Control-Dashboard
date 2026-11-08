# Incident response

Keep this open during an incident. Report vulnerabilities in the dashboard itself via [SECURITY.md](../../SECURITY.md).

## First 15 minutes (any incident)

1. Preserve evidence: copy the current logs (stdout including `AUDIT` lines) and note the time.
2. Pull the Redis audit trail as an administrator: `GET /api/v2/admin/audit?limit=500` ([audit logs](../features/audit-logs.md)).
3. Decide: contain first (below), then investigate.

## A secret leaked

| Secret                 | Contain                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`          | Rotate it, restart (everyone signs in again); consider the Discord refresh tokens exposed to whoever held both Redis data and the secret |
| `DISCORD_CLIENT_SECRET`| Reset it in the Developer Portal, update the variable, restart                                                       |
| Console keys / adapter | Delete the key (or change the token) in the Console first, then update the dashboard                                  |
| `OWNER_KEY_SECRET`     | Attackers can derive owner keys: rotate with `OWNER_KEY_PREVIOUS_SECRET` + `npm run marketplace:rekey` ([migration](../deployment/migration.md)) |
| Redis password         | Change it on Redis and in `REDIS_URL`; assume sessions were readable                                                  |
| Webhook URL            | Delete and recreate the webhook                                                                                       |

## A session cookie or an administrator account is compromised

1. Administrator: call `DELETE /api/v2/admin/sessions` (needs a sign-in within the high-risk window) to end all your sessions.
2. Remove the person's ID from `ADMIN_DISCORD_IDS` and restart if the account itself is suspect; remove their Discord role.
3. For a member session: removing the role ends it within 30 minutes. For everyone: change `AUTH_SECRET` or delete `arrakis:session:*` ([session management](../administration/session-management.md)).
4. Review `admin.operation` events since the suspected time and rotate `ADMIN_CONSOLE_API_KEY`. Check the Console's own admin audit/history for what the key did.
5. Restore from backup any game data that was changed ([backups](../administration/backups.md)).

## Suspicious traffic

- Many `auth.login_failed` from one `ip`: block at the proxy/firewall; the per-email limit (10 per 15 minutes) already limits guessing.
- Many `security.origin_rejected`: a cross-site probe; confirm `APP_URL`, no action otherwise.
- `security.control_failure`: Redis is down; the site is failing closed. Fix Redis.

## After the incident

Write down timeline, cause and fixes; rotate anything that might have been exposed; add a monitor for the signal you missed
([monitoring](../administration/monitoring.md)); update this repository's documentation if a procedure was wrong.
