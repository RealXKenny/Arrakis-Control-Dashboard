# API: authentication

## Auth.js routes

`/api/auth/[...nextauth]` (GET and POST) serves the standard Auth.js endpoints: `/api/auth/csrf`, `/api/auth/signin`,
`/api/auth/callback/discord`, `/api/auth/callback/credentials`, `/api/auth/signout`, `/api/auth/session`. Notes:

- Sign-out is POST-only and needs the Auth.js CSRF token from `GET /api/auth/csrf`.
- The Discord callback URL is `<APP_URL>/api/auth/callback/discord` ([Discord OAuth](../configuration/discord-oauth.md)).
- The public `session` JSON carries display data only: no roles, email or session ID.
- Password sign-in is the credentials provider (`email`, `password`; password at most 128 characters), rate limited
  ([rate limits](rate-limits.md)).

## `GET /api/session`

Reports whether the cookie maps to a live server-side session.

| | |
| --- | --- |
| Auth | Session cookie |
| 200 | `{ "ok": true, "cacheScope": "<opaque>", "expiresAt": 1799999999999 }` |
| 401 | `{ "error": "Unauthorized" }` and the stale cookie is cleared |

`cacheScope` is a derived value the UI uses to keep per-user caches apart; it is not the session ID.

## `POST /api/v2/auth/password`

Finish Discord signup by attaching a password to the Discord-verified email on the session.

| | |
| --- | --- |
| Auth | Session cookie; same-origin |
| Limit | 6 per 15 minutes per member; body ≤ 2048 bytes |
| Body | `{ "password": "…", "confirmPassword": "…" }` (12 to 128 characters, must match) |
| 200 | `{ "ok": true }` |
| Errors | 401 `UNAUTHORIZED`; 403 `INVALID_ORIGIN`; 409 `NO_VERIFIED_EMAIL`, `PASSWORD_EXISTS`; 413 `BODY_TOO_LARGE`; 422 `INVALID_PASSWORD`; 429 `RATE_LIMITED` |

The email always comes from the session, never from the body. Audit: `auth.password_set`.

## Revocation

`DELETE /api/v2/admin/sessions` — see [Administrator API](administrator.md#delete-apiv2adminsessions).
