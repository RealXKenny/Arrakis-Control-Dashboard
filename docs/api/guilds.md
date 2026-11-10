# API: guilds

## Private recruit onboarding (V2)

`GET /api/v2/guilds/{guildId}/onboarding` returns `{ ok: true, data: { revision, rulesRevision, guide, canEdit, self, members, roster } }` after fresh linked-character membership verification. The guide contains `welcome`, `rules`, `locations` and up to 20 `{ id, text }` checklist items. `self` is the caller's progress or `null`. Only leaders receive the retained `members` overview and current `roster` assignment options; other members receive empty arrays. Progress includes a guild-specific opaque `memberKey`, name, nullable `mentorKey`/current `mentorName`, completed step UUIDs, acknowledged `rulesRevision`, `updatedAt` and `currentMember`. Raw Console character IDs and Discord IDs are excluded. References identify roster entries; they are not authorization credentials. Responses are no-store.

Same-origin `POST` accepts at most 32 KiB and one of these strict bodies:

- `{ action: "guide", revision, guide: { welcome, rules, locations, steps: [{ id, text }] } }` — leader-only. Welcome/locations allow 2,000 characters each, rules 4,000 and each item 1–200; IDs are unique UUIDs. Edits preserve only completion marks for unchanged item IDs/text. Changed rules rotate `rulesRevision` and require fresh acknowledgments.
- `{ action: "complete", revision, stepId, completed }` — set or undo one current step for the session's verified character. Caller-supplied target identity is refused.
- `{ action: "acknowledge-rules", revision }` — acknowledge the current nonempty rules for the session character.
- `{ action: "mentor", revision, memberKey, mentorKey }` — leader-only assignment to a current recruit and a different current mentor; `mentorKey: null` clears it. Both references are resolved against the fresh roster.
- `{ action: "remove-progress", revision, memberKey }` — leader-only removal of a retained progress record, including former members. It removes the assignment and completion history together; current members may start again.

Writes return the updated caller-relative view in the same success envelope. The whole document uses one UUID revision (`null` before the first save) and atomic Redis compare-and-set. Stale writes return `409 ONBOARDING_CONFLICT`; preserve drafts and refresh explicitly without automatic retries. Limits are 200 progress records, 500 current roster entries, 256 KiB stored data and 90 days of inactivity retention refreshed only by changes. Dashboard disbanding removes the document. Other errors include `409 ONBOARDING_MEMBER_CHANGED`, `409 ONBOARDING_FULL`, `503 ONBOARDING_UNAVAILABLE`, `429/503 ONBOARDING_LIMITED`, `400 INVALID_ONBOARDING`, `413 ONBOARDING_BODY_TOO_LARGE` and shared origin, authentication and membership/leadership errors. Read/write limits are 60/30 per minute per user, plus shared Console verification budgets. No endpoint changes game permissions or rank, verifies physical task completion, or sends mentor notifications.

## Private shared base directory (V2)

`GET /api/v2/guilds/{guildId}/base-directory` returns `{ ok: true, data: { canEdit, entries } }` after fresh linked-character membership verification. Entries contain UUID `id`/`revision`, `name`, `map`, `purpose`, `location`, `contact`, `accessInstructions`, `notes`, `status` (`active`/`archived`), ISO `createdAt`/`updatedAt` and the verified `updatedByName`. No account or Console character IDs are stored in listings or returned. Responses are no-store.

Same-origin `POST` requires freshly verified role-100 leadership and accepts at most 16 KiB:

- `{ action: "save", revision, entry: { id, name, map, purpose, location, contact, accessInstructions, notes } }` — create with a UUID and `revision: null`, or edit using the current revision. Required fields: name (1–100 characters), location (1–250), contact (1–200), instructions (1–1,000); notes may be empty (up to 1,500). Map is `hagga-basin` or `deep-desert`; purpose is `headquarters`, `storage`, `crafting`, `staging`, `outpost` or `other`. Editing preserves archive status.
- `{ action: "status", id, revision, status: "active" | "archived" }` — archive or restore directions.
- `{ action: "delete", id, revision }` — remove only the directory listing.

Writes return `{ ok: true, data: { entry } }`, with the updated listing or `null` after deletion. Caller-supplied ownership, editor and permission fields are rejected. Limits are 50 retained listings per guild and 32 KiB per stored entry; atomic revision checks prevent stale writes and concurrent quota overruns. All records share a Cluster-compatible guild key, expire 90 days after the last change, and are cleared on dashboard disbanding. Reads never extend retention. Reads allow 60/minute and writes 20/minute per user, with additional shared Console verification budgets.

Important failures include `409 BASE_DIRECTORY_CONFLICT`, `409 BASE_DIRECTORY_FULL`, `503 BASE_DIRECTORY_UNAVAILABLE`, `429/503 BASE_DIRECTORY_LIMITED`, `400 INVALID_BASE_DIRECTORY`, `413 BASE_DIRECTORY_BODY_TOO_LARGE`, `413 BASE_DIRECTORY_ENTRY_TOO_LARGE` and `403 GUILD_LEADER_REQUIRED`, plus shared authentication, membership and origin errors. Keep drafts after a failure and refresh explicitly before retrying. These manual metadata records never verify ownership or alter in-game permissions, inventory, currency or marketplace blueprints.

## Private resource requests (V2)

`GET /api/v2/guilds/{guildId}/resource-requests` returns `{ ok: true, data: { canEdit, requests } }` after fresh membership verification. `canEdit` indicates leader status; requesters also manage their own records. Each request includes UUID `id`/`revision`, `material`, `quantity`, `unit`, `dropoff`, `details`, `priority` (`normal`/`urgent`), `status` (`open`/`fulfilled`/`cancelled`), requester name, timestamps, `isRequester` and `pledges`. Pledges expose opaque UUID IDs, display names, quantity, status (`promised`/`reported`/`confirmed`), timestamps, confirmer name and `isSelf`. Canonical requester, supplier and confirmer IDs remain server-side. Responses are no-store.

Same-origin `POST` bodies are bounded to 16 KiB. All quantities must be positive whole-number decimal strings of up to 18 digits, not JSON numbers. Supported actions:

- `{ action: "save", revision, request: { id, material, quantity, unit, dropoff, details, priority } }` — members create with a UUID and `revision: null`; requester/leader edits use the current UUID revision. Material allows 100 characters, unit 30, drop-off 200 and notes 1,500. Existing pledges lock material/unit and bound quantity reductions.
- `{ action: "pledge", id, revision, quantity }` — create or revise the caller's outstanding promise; never accept caller-supplied supplier identity. The requester cannot pledge to their own request, and all promises plus confirmed deliveries must fit the requested quantity.
- `{ action: "withdraw", id, revision }` or `{ action: "report", id, revision }` — supplier-only changes to their own promised pledge. Reporting does not confirm delivery.
- `{ action: "confirm", id, revision, pledgeId }` or `{ action: "return-claim", id, revision, pledgeId }` — requester/leader reviews a reported delivery. Self-confirmation is refused, even for leaders. Returned claims become promised again.
- `{ action: "release-pledge", id, revision, pledgeId }` — requester/leader releases an unconfirmed reservation; confirmed receipts cannot be removed individually.
- `{ action: "cancel", id, revision }` or `{ action: "delete", id, revision }` — requester/leader closes or removes the record. Fulfillment is automatic when confirmed quantities reach the target; closed records do not reopen.

Writes return `{ ok: true, data: { request } }`, with an updated caller-relative view or `null` after deletion. Atomic compare-and-set checks prevent stale edits, duplicate outstanding promises, over-commitment and concurrent quota overruns. A confirmed partial receipt remains while the same supplier adds another promise. Limits are 20 retained guild requests, 5 open requests per character, 20 pledge/receipt entries per request and 64 KiB per record. Retention is 90 days from the last successful change; reads do not refresh it, and dashboard disbanding deletes the guild key.

Important error codes include `RESOURCE_CONFLICT`, `RESOURCE_OVERCOMMITTED`, `RESOURCE_PLEDGE_LOCKED`, `RESOURCE_SELF_PLEDGE`, `RESOURCE_SELF_CONFIRMATION`, `RESOURCE_MEMBER_LIMIT`, `RESOURCE_PLEDGES_FULL`, `RESOURCES_FULL`, `RESOURCE_CLOSED` and `RESOURCE_MANAGER_REQUIRED`. Keep drafts after failed/uncertain writes and refresh explicitly before retrying. Read/write budgets also protect fresh Console verification. No action moves game items or currency; receipt confirmation is a manual assertion by an authorized member.

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
