# API: guilds

## Private operations planner (V2)

`GET /api/v2/guilds/{guildId}/operations` returns `{ ok: true, data: { canEdit, operations } }` after fresh membership verification. Up to 20 operations include UUID IDs/revisions, title, kind (`spice-run`, `deep-desert`, `boss-run`, `other`), details, meeting point, UTC start/end times, role capacities, status, organizer name, timestamps and sign-ups. Sign-ups expose opaque UUID IDs, verified display names, role, time and an `isSelf` flag; Console character IDs remain server-side. Responses are no-store.

Same-origin `POST` bodies are limited to 16 KiB and accept:

- `{ action: "save", revision, operation: { id, title, kind, details, meetingPoint, startsAt, endsAt, roles } }` — leader-only create/edit. New IDs use UUIDs and `revision: null`; edits use the current UUID revision. `roles` is a unique array of `{ role, capacity }`, using pilot/scout/escort/harvester/support, with 1–50 total slots. Titles allow 100 characters, meeting points 200 and details 2,000. Starts must be future times within one year, and duration must be positive and at most 24 hours.
- `{ action: "join", id, revision, role }` or `{ action: "leave", id, revision }` — current members reserve, switch or withdraw their own verified character's role before the start. No caller-supplied identity is accepted.
- `{ action: "status", id, revision, status: "completed" | "cancelled" }` — leader-only closure; closed runs cannot reopen.
- `{ action: "remove-signup", id, revision, signupId }` — leader-only removal of a retained sign-up.
- `{ action: "delete", id, revision }` — leader-only removal of the operation.

Successful writes return `{ ok: true, data: { operation } }`, with the updated caller-relative view or `null` after deletion. UUID revisions and a single-key Redis compare-and-set protect capacity, duplicate sign-ups and stale requests. Never automatically repeat a failed/uncertain write; refresh explicitly and preserve drafts. `409` codes include `OPERATIONS_CONFLICT`, `OPERATION_ROLE_FULL`, `OPERATION_CAPACITY_CONFLICT`, `OPERATION_CLOSED` and `OPERATIONS_FULL`. Authentication, membership/leader verification, origin, body-size and rate-limit failures use the shared V2 error envelope.

Storage is bounded to 20 records of 64 KiB each. Read/write budgets also protect Console verification. Retention refreshes on changes and extends through the run end plus 90 days; reads do not refresh it. Dashboard disbanding deletes the guild's operations key. This metadata-only API never changes in-game inventory, currency or movement.

## Private noticeboard (V2)

`GET /api/v2/guilds/{guildId}/noticeboard` returns `{ ok: true, data: { board, canEdit } }` only after fresh linked-character membership verification. `board` contains `guildId`, a nullable UUID `revision`, `message`, `priorities` and up to 20 `posts`. Each post has a UUID `id`, `title`, `body`, `pinned`, a verified `authorName` and an ISO `updatedAt`. At most 5 posts may be pinned. No dashboard account IDs are included in posts.

`POST` to the same path requires same-origin headers, a current session and a freshly verified role-100 guild leader. Bodies are bounded to 16 KiB and accept one of these actions:

- `{ action: "settings", revision, message, priorities }` — change the daily message and priorities (up to 1,000 characters each).
- `{ action: "save-post", revision, post: { id, title, body, pinned } }` — create or edit an announcement (100-character title, 3,000-character body).
- `{ action: "delete-post", revision, id }` — remove an existing announcement.

Use the revision returned by GET; a new board starts with `null`. Successful writes return the updated view and a new UUID revision. Concurrent or stale changes return `409 NOTICEBOARD_CONFLICT`; clients keep drafts and refresh explicitly without automatically repeating writes. Other failures include `401` sign-in required, `403` membership/leadership or origin refusal, `413` oversized bodies, `429` request budgets and `503` verification/storage outages. Responses are no-store. Guild records use a single Cluster-compatible Redis key, expire after 90 days without an update, and are cleared by dashboard disbanding.

Legacy-family routes (`{ ok, data }` success, `{ ok: false, error, code, requestId }` failure). Mutations are same-origin. Leader routes
re-verify leadership against the Console on every call.

## Directory and status

| Method | Route                                         | Notes                                                                                   |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/guilds`                                 | Guild list/roster data from the Console for the signed-in member                        |
| GET    | `/api/guilds/requirements?page=`              | Published recruitment listings, newest first (20 per page)                              |
| GET    | `/api/guilds/application-status?guildIds=a,b` | Your application status and unread count per guild; ≤ 20 unique IDs, query ≤ 1800 chars |

## Guild settings (leader)

| Method   | Route                                | Notes                                                                                                                  |
| -------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| GET      | `/api/guilds/{guildId}/requirements` | Saved settings or `null`                                                                                               |
| POST     | `/api/guilds/{guildId}/requirements` | Save listing; 400 `INVALID_GUILD_REQUIREMENTS`; 503 `GUILD_NAME_UNAVAILABLE` when the Console name cannot be confirmed |
| GET/POST | `/api/guilds/{guildId}/logo`         | Guild logo                                                                                                             |
| DELETE   | `/api/guilds/{guildId}`              | Disband; body `{ "confirmation": "DISBAND GUILD" }`                                                                    |

Settings body (validated by `guildRequirementSchema`): `guildName` (1 to 100, replaced by the Console's name), `requirements` (≤ 2000),
`contact` (≤ 200), `published` (boolean), `applicationQuestions` (≤ 8; `id` UUID, `label` ≤ 200, `required`, `type` one of
`shortText`, `longText`, `dropdown`, `timezone`, `checkbox`, `number`, `options` ≤ 30 × 100 chars).

## Members (leader)

| Method | Route                                              | Body                                                                                                    |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET    | `/api/guilds/{guildId}/members`                    | roster                                                                                                  |
| POST   | `/api/guilds/{guildId}/members`                    | `{ "playerId": "…", "roleId": 1 }` (roleId 1 to 99, default 1)                                          |
| DELETE | `/api/guilds/{guildId}/members/{playerId}`         | `{ "expectedRole": 1 }`                                                                                 |
| POST   | `/api/guilds/{guildId}/members/{playerId}/promote` | `{ "expectedRole": 1, "confirmation": "TRANSFER LEADERSHIP" }` (confirmation only for Officer → Leader) |
| POST   | `/api/guilds/{guildId}/members/{playerId}/demote`  | `{ "expectedRole": 50 }`                                                                                |

`expectedRole` (1 to 100) must equal the member's current Console rank, else 409 `GUILD_MEMBER_CHANGED`. Other errors: 409 `GUILD_LEADER_PROTECTED`,
`INVALID_GUILD_RANK_CHANGE`; 403 `GUILD_LEADER_REQUIRED`; 503 `PLAYER_VERIFICATION_UNAVAILABLE`. Console writes are never retried.

## Applications

| Method | Route                                          | Who       | Notes                                                                            |
| ------ | ---------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| GET    | `/api/guilds/{guildId}/application`            | applicant | Your application or `null`                                                       |
| POST   | `/api/guilds/{guildId}/application`            | applicant | Submit; 201                                                                      |
| GET    | `/api/guilds/{guildId}/applications?page=0..9` | leader    | `{ rows, hasMore }`, 20 per page                                                 |
| POST   | `/api/guilds/{guildId}/applications`           | leader    | Review `{ "applicationId": "<64 hex>", "status": "accepted\|declined\|remove" }` |

Submit body: `{ "answers": { "<question-uuid>": "text" | true }, "questionVersion": "<from listing>" }`. Answers are validated against the
current questions on the server. Errors: 409 `GUILD_NOT_RECRUITING`, `GUILD_APPLICATION_NOT_CONFIGURED`, `GUILD_APPLICATION_FORM_CHANGED`,
`GUILD_APPLICATION_EXISTS`, `GUILD_APPLICATION_INBOX_FULL`; 400 `INVALID_GUILD_APPLICATION`, `INVALID_GUILD_APPLICATION_ANSWERS`; 403 `LINKED_PLAYER_REQUIRED`.
Review errors: 404 `GUILD_APPLICATION_NOT_FOUND`; 409 `GUILD_APPLICATION_BUSY`, `GUILD_APPLICATION_CHANGED`, `GUILD_APPLICATION_ACCEPTED`;
503 `GUILD_APPLICATION_SAVE_UNAVAILABLE`.

## Application chat

| Method | Route                                                         | Body / notes                                                                                   |
| ------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/guilds/{guildId}/applications/{applicationId}/messages` | `{ ok, data: { messages: [...] } }` (≤ 100)                                                    |
| POST   | `.../messages/send`                                           | `{ "clientMessageId": "<uuid>", "text": "1-1000 chars" }`                                      |
| POST   | `.../messages/read`                                           | `{ "messages": [ { "id": "<uuid>", "senderId": "…" } ] }` (applicant only) → `{ unreadCount }` |

Message object: `{ id, text, senderId, senderName, role: "applicant"|"reviewer", sentAt }`. Retried sends with the same `clientMessageId` return the
stored message. Non-leaders reading someone else's chat get 403 `GUILD_LEADER_REQUIRED`.

## Support (leader ↔ administrators)

`GET /api/guilds/{guildId}/support`, `POST .../support/send`, `POST .../support/read`, `GET .../support/status` (`{ unreadCount }`), with the
same message shape. Administrators use `/api/admin/guilds/{guildId}/messages*`.

## Rate limits

Reads 120/min, writes 30/min per client and route ([rate limits](rate-limits.md)).
