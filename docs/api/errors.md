# API: errors

## Envelopes

V2 routes:

```json
{ "ok": false, "error": "Invalid request origin.", "code": "INVALID_ORIGIN" }
```

Legacy routes add the request ID (also in the `X-Request-ID` header; quote it when reporting problems):

```json
{ "ok": false, "error": "Too many requests", "code": "RATE_LIMITED", "requestId": "0f6c…" }
```

Anything unexpected becomes `500 INTERNAL_ERROR` with a generic message; stacks, credentials and provider bodies are logged server-side
(redacted) and never returned. A few older handlers return `{ "error": "…" }` without `ok`.

## Common codes

| HTTP | Code                              | Meaning                                                                       |
| ---- | --------------------------------- | ----------------------------------------------------------------------------- |
| 400  | `INVALID_REQUEST`, `INVALID_*`    | Validation failed (the code names the area, e.g. `INVALID_GUILD_APPLICATION`)  |
| 401  | `UNAUTHORIZED`                    | No valid session                                                               |
| 403  | `FORBIDDEN`                       | Not permitted (not an administrator, not the owner)                            |
| 403  | `INVALID_ORIGIN`                  | Mutation without a same-origin `Origin`                                         |
| 403  | `ADMIN_REAUTH_REQUIRED`           | Administrator step-up window elapsed                                             |
| 403  | `CONSOLE_OPERATION_RESTRICTED`    | Catalog operation the Console never allows to API keys                           |
| 403  | `GUILD_LEADER_REQUIRED`           | Not a freshly verified guild leader                                              |
| 404  | `NOT_FOUND`, `GUILD_APPLICATION_NOT_FOUND` | Missing (or deliberately indistinguishable from "not yours")            |
| 405  | `METHOD_NOT_ALLOWED`              | Wrong method (see `Allow`)                                                      |
| 409  | `GUILD_*`, `USER_LIMIT`, `STORAGE_LIMIT`, `ALREADY_PUBLISHED` | State conflict or quota                                    |
| 413  | `PAYLOAD_TOO_LARGE`, `REQUEST_TOO_LARGE`, `UPLOAD_TOO_LARGE` | Body over the endpoint limit                                |
| 414  | `URI_TOO_LONG`                    | URL longer than 2048 characters (legacy routes)                                  |
| 415  | `UNSUPPORTED_MEDIA_TYPE`          | Wrong content type                                                               |
| 422  | `INVALID_BASE`, `INVALID_PASSWORD`, `INVALID_ANNOUNCEMENT` | Semantically invalid content                                      |
| 429  | `RATE_LIMITED`                    | Over a limit; honour `Retry-After`                                                |
| 500  | `INTERNAL_ERROR`                  | Unexpected failure                                                                |
| 503  | `SERVER_BUSY`                     | Concurrency cap; `Retry-After: 2`                                                 |
| 503  | `RATE_LIMIT_UNAVAILABLE`          | Redis down; the limiter fails closed                                              |
| 503  | `STORAGE_UNAVAILABLE`             | Redis-backed feature unavailable                                                   |
| 503  | `ADMIN_CONFIG_REQUIRED`, `ADMIN_SECURE_TRANSPORT_REQUIRED` | Administrator credentials/HTTPS to the Console missing                   |
| 502  | —                                 | Console answered 2xx but with `ok: false` (administrator execute)                  |

During a bad production configuration **every** request returns HTTP 500 ([startup errors](../troubleshooting/startup-errors.md)).
