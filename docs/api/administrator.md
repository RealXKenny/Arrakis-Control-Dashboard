# API: administrator

All routes below require a verified administrator ([administrator access](../configuration/administrator-access.md)): 401 signed out,
403 `FORBIDDEN` otherwise (audit `admin.access_denied`). Mutations are same-origin only.

| Method   | Route                                                                      | Purpose                                                           |
| -------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GET      | `/api/v2/admin/overview`                                                   | Credential status, service health, statistics                     |
| GET      | `/api/v2/admin/catalog`                                                    | The allowlisted operation catalog                                 |
| POST     | `/api/v2/admin/execute`                                                    | Run one catalog operation (JSON, forms, downloads, event streams) |
| POST     | `/api/v2/admin/upload`                                                     | Run one upload/multipart catalog operation                        |
| GET      | `/api/v2/admin/audit`                                                      | Audit events, newest first                                        |
| DELETE   | `/api/v2/admin/sessions`                                                   | End all of the caller's sessions                                  |
| POST     | `/api/v2/changelog/announce`                                               | Post/edit a Discord release announcement                          |
| GET      | `/api/admin/guild-support-status`                                          | Unread support counts across guilds                               |
| GET      | `/api/admin/guilds/{guildId}/applications`                                 | A guild's applications and listing                                |
| GET      | `/api/admin/guilds/{guildId}/applications/{applicationId}/messages`        | One application's chat                                            |
| GET/POST | `/api/admin/guilds/{guildId}/messages`, `/messages/send`, `/messages/read` | Guild support thread                                              |

## `POST /api/v2/admin/execute`

Request (JSON, ≤ 128 KiB; or `application/x-www-form-urlencoded` with a `request` field for native download posts):

```json
{
  "operation": "post-backups-create",
  "path": {},
  "query": {},
  "body": {},
  "acknowledgement": "POST /api/backups/create"
}
```

| Field             | Rule                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation`       | An `id` from the catalog (≤ 180 characters); unknown → 400 `INVALID_OPERATION`                                                                                   |
| `path`            | Values for the operation's path parameters only; extras → 400                                                                                                    |
| `query`           | Strings (≤ 2000), finite numbers or booleans                                                                                                                     |
| `body`            | Object; ≤ 200 fields per level, ≤ 1000 array entries, depth ≤ 10; `__proto__`/`prototype`/`constructor` rejected; integers beyond 2^53 must be strings           |
| `acknowledgement` | For non-GET operations exactly `"<METHOD> <route>"`, else 400 `CONFIRMATION_REQUIRED`; add the Console confirmation phrase in `body` where the catalog lists one |

Order of checks: same-origin → administrator → admin budget (300/min) → body limit → parse → restriction (403 `CONSOLE_OPERATION_RESTRICTED`)
→ **step-up** (high-risk 60 min or general 12 h, see [risk classes](../features/administrator-panel.md#step-up-re-authentication)) →
credential configured (503 `ADMIN_CONFIG_REQUIRED`) → HTTPS to the Console (503 `ADMIN_SECURE_TRANSPORT_REQUIRED`) → call.

Response (JSON operations): `{ "ok": true, "upstreamStatus": 200, …sanitized Console fields }`; failures add `"code": "CONSOLE_OPERATION_FAILED"`
and an `error`. Upstream 429 is passed through with a `Retry-After`. Downloads are streamed as attachments; event operations as sanitized
server-sent events. Secrets and unknown shapes are stripped from results.

Other errors: 400 `INVALID_REQUEST`, 413 `REQUEST_TOO_LARGE`, 400 `UPLOAD_REQUIRED`, 403 `ADMIN_REAUTH_REQUIRED`, 429 `RATE_LIMITED`.

## `POST /api/v2/admin/upload`

`multipart/form-data` with a `request` field (JSON as above, ≤ 64 KiB) plus only the file fields the operation lists. Total ≤ 8 MiB (413
`UPLOAD_TOO_LARGE`); other problems 400 `INVALID_UPLOAD`. Always needs the **high-risk** sign-in window.

## `GET /api/v2/admin/audit`

`?limit=` 1 to 500 (default 100). Response `{ "ok": true, "events": [ { "id", "at", "event", "outcome", "actor?", "ip?", "data?" } ] }`.

## `DELETE /api/v2/admin/sessions`

No body. Same-origin, administrator, high-risk window, 300/min budget.

```json
{ "ok": true, "signedOut": true }
```

Any target in the request is ignored: only the caller's own sessions are ever revoked. Audit `admin.sessions_revoked`.

## `POST /api/v2/changelog/announce`

Body ≤ 64 KiB, validated by `announcementInputSchema` (422 `INVALID_ANNOUNCEMENT` names the field). 20 per hour per administrator,
general step-up window. Response `{ "ok": true, "edited": false, "parts": 3 }` reports the tracked message count. Large releases are split into numbered V2 messages with complete notes. Needs `DISCORD_BOT_TOKEN` and `CHANGELOG_CHANNEL_ID` ([Discord announcements](../integrations/webhooks.md)).

## Guild oversight

Same shapes as the guild endpoints ([guilds API](guilds.md)) but readable by any administrator regardless of leadership; replies need the
general step-up window.
