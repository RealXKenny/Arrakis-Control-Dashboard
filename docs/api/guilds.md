# API: guilds

Legacy-family routes (`{ ok, data }` success, `{ ok: false, error, code, requestId }` failure). Mutations are same-origin. Leader routes
re-verify leadership against the Console on every call.

## Directory and status

| Method | Route                              | Notes                                                                                      |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/api/guilds`                      | Guild list/roster data from the Console for the signed-in member                            |
| GET    | `/api/guilds/requirements?page=`   | Published recruitment listings, newest first (20 per page)                                   |
| GET    | `/api/guilds/application-status?guildIds=a,b` | Your application status and unread count per guild; ≤ 20 unique IDs, query ≤ 1800 chars |

## Guild settings (leader)

| Method | Route                                   | Notes                                                                                    |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/guilds/{guildId}/requirements`    | Saved settings or `null`                                                                  |
| POST   | `/api/guilds/{guildId}/requirements`    | Save listing; 400 `INVALID_GUILD_REQUIREMENTS`; 503 `GUILD_NAME_UNAVAILABLE` when the Console name cannot be confirmed |
| GET/POST | `/api/guilds/{guildId}/logo`          | Guild logo                                                                                |
| DELETE | `/api/guilds/{guildId}`                 | Disband; body `{ "confirmation": "DISBAND GUILD" }`                                       |

Settings body (validated by `guildRequirementSchema`): `guildName` (1 to 100, replaced by the Console's name), `requirements` (≤ 2000),
`contact` (≤ 200), `published` (boolean), `applicationQuestions` (≤ 8; `id` UUID, `label` ≤ 200, `required`, `type` one of
`shortText`, `longText`, `dropdown`, `timezone`, `checkbox`, `number`, `options` ≤ 30 × 100 chars).

## Members (leader)

| Method | Route                                              | Body                                                         |
| ------ | -------------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/api/guilds/{guildId}/members`                    | roster                                                        |
| POST   | `/api/guilds/{guildId}/members`                    | `{ "playerId": "…", "roleId": 1 }` (roleId 1 to 99, default 1) |
| DELETE | `/api/guilds/{guildId}/members/{playerId}`         | `{ "expectedRole": 1 }`                                       |
| POST   | `/api/guilds/{guildId}/members/{playerId}/promote` | `{ "expectedRole": 1, "confirmation": "TRANSFER LEADERSHIP" }` (confirmation only for Officer → Leader) |
| POST   | `/api/guilds/{guildId}/members/{playerId}/demote`  | `{ "expectedRole": 50 }`                                      |

`expectedRole` (1 to 100) must equal the member's current Console rank, else 409 `GUILD_MEMBER_CHANGED`. Other errors: 409 `GUILD_LEADER_PROTECTED`,
`INVALID_GUILD_RANK_CHANGE`; 403 `GUILD_LEADER_REQUIRED`; 503 `PLAYER_VERIFICATION_UNAVAILABLE`. Console writes are never retried.

## Applications

| Method | Route                                                              | Who         | Notes                                                       |
| ------ | ------------------------------------------------------------------ | ----------- | ----------------------------------------------------------- |
| GET    | `/api/guilds/{guildId}/application`                                | applicant   | Your application or `null`                                   |
| POST   | `/api/guilds/{guildId}/application`                                | applicant   | Submit; 201                                                   |
| GET    | `/api/guilds/{guildId}/applications?page=0..9`                     | leader      | `{ rows, hasMore }`, 20 per page                              |
| POST   | `/api/guilds/{guildId}/applications`                               | leader      | Review `{ "applicationId": "<64 hex>", "status": "accepted\|declined\|remove" }` |

Submit body: `{ "answers": { "<question-uuid>": "text" | true }, "questionVersion": "<from listing>" }`. Answers are validated against the
current questions on the server. Errors: 409 `GUILD_NOT_RECRUITING`, `GUILD_APPLICATION_NOT_CONFIGURED`, `GUILD_APPLICATION_FORM_CHANGED`,
`GUILD_APPLICATION_EXISTS`, `GUILD_APPLICATION_INBOX_FULL`; 400 `INVALID_GUILD_APPLICATION`, `INVALID_GUILD_APPLICATION_ANSWERS`; 403 `LINKED_PLAYER_REQUIRED`.
Review errors: 404 `GUILD_APPLICATION_NOT_FOUND`; 409 `GUILD_APPLICATION_BUSY`, `GUILD_APPLICATION_CHANGED`, `GUILD_APPLICATION_ACCEPTED`;
503 `GUILD_APPLICATION_SAVE_UNAVAILABLE`.

## Application chat

| Method | Route                                                                   | Body / notes                                                    |
| ------ | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/guilds/{guildId}/applications/{applicationId}/messages`           | `{ ok, data: { messages: [...] } }` (≤ 100)                      |
| POST   | `.../messages/send`                                                     | `{ "clientMessageId": "<uuid>", "text": "1-1000 chars" }`        |
| POST   | `.../messages/read`                                                     | `{ "messages": [ { "id": "<uuid>", "senderId": "…" } ] }` (applicant only) → `{ unreadCount }` |

Message object: `{ id, text, senderId, senderName, role: "applicant"|"reviewer", sentAt }`. Retried sends with the same `clientMessageId` return the
stored message. Non-leaders reading someone else's chat get 403 `GUILD_LEADER_REQUIRED`.

## Support (leader ↔ administrators)

`GET /api/guilds/{guildId}/support`, `POST .../support/send`, `POST .../support/read`, `GET .../support/status` (`{ unreadCount }`), with the
same message shape. Administrators use `/api/admin/guilds/{guildId}/messages*`.

## Rate limits

Reads 120/min, writes 30/min per client and route ([rate limits](rate-limits.md)).
