# Audit logs

## Purpose

A durable, redacted record of security-relevant actions: who signed in, who was refused, who changed what.

## Where events go

| Sink             | Setting            | Format                                                         |
| ---------------- | ------------------ | -------------------------------------------------------------- |
| stdout           | `AUDIT_LOG_STDOUT` | Readable AUDIT entries with event, outcome, actor and audit ID |
| Redis sorted set | `AUDIT_LOG_REDIS`  | `arrakis:{audit}:v1:events`, newest first, bounded             |

Retention and caps: [logging](../configuration/logging.md#audit-trail). Events within the same millisecond keep their order.

## Event catalogue

| Event                            | Outcome           | When                                                                                                          |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `auth.login`                     | success           | Interactive sign-in (actor = Discord ID)                                                                      |
| `auth.login_failed`              | failure / denied  | Bad password (reason, no email), missing role, rate limited                                                   |
| `auth.logout`                    | success           | Sign-out                                                                                                      |
| `auth.password_set`              | success           | A member set their email password                                                                             |
| `auth.session_revoked`           | success           | A Discord re-check ended a session (reason)                                                                   |
| `admin.operation`                | success / failure | An administrator write or download (operation id, upstream status)                                            |
| `admin.access_denied`            | denied            | A non-administrator called an admin API                                                                       |
| `admin.reauth_required`          | denied            | A change was refused because the sign-in was too old (`highRisk`)                                             |
| `admin.sessions_revoked`         | success           | An administrator ended all their sessions                                                                     |
| `admin.announcement`             | success           | A release announcement was posted                                                                             |
| `guild.<action>`                 | success           | Guild member add/remove/promote/demote/disband (`guild.add`, …)                                               |
| `guild.settings_updated`         | success           | A leader changed recruitment settings                                                                         |
| `guild.noticeboard_updated`      | success           | A verified leader saved noticeboard settings, an announcement, or a removal (guild ID and action only)        |
| `guild.operation_updated`        | success           | A verified member changed an operation or their sign-up (guild ID, operation ID and action only)              |
| `guild.resource_request_updated` | success           | A verified member changed a resource request, pledge or delivery claim (guild ID, request ID and action only) |
| `security.origin_rejected`       | denied            | A mutation had a missing or foreign `Origin`                                                                  |
| `security.control_failure`       | failure           | The rate limiter's Redis was unavailable (fail-closed), at most once a minute                                 |

Fields: `id`, `at`, `event`, `outcome` (`success`, `failure`, `denied`), optional `actor` (numeric Discord ID), `ip` (IPv4 or IPv6
`/64`), and flat `data`. Secret-looking keys, nested objects and request bodies never enter the trail; strings are capped at 200
characters. Passwords and emails are never logged.

## Reading it

Administrators: `GET /api/v2/admin/audit?limit=100` (1 to 500, newest first; malformed stored entries are skipped).
Operators: filter the readable stdout entries, or ship them to your log platform. Longer entries include indented detail
rows; retain those rows when shipping. Existing parsers for the former `AUDIT {json}` format must be updated. Redis and the
administrator API preserve structured JSON records.

```bash
journalctl -u arrakis-dashboard | grep -A 5 'AUDIT'
```

## Limitations

The Redis copy is bounded and not a durable archive; stdout shipping is the retention mechanism. The log contains no
Console-side audit data (the Console has its own admin audit log).

## Related

[Monitoring](../administration/monitoring.md) · [Incident response](../security/incident-response.md) · [API](../api/administrator.md#get-apiv2adminaudit)
