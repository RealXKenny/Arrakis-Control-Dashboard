# Debugging

## Logs

`LOG_LEVEL=DEBUG` prints redacted metadata and compact background-poll diagnostics to the colourful console log. There are no log
files. Use `LOG_LEVEL=INFO` in production ([logging](../configuration/logging.md)).

## Follow a request

Every response has `X-Request-ID`. A well-formed incoming `x-request-id` is kept (letters, digits, `.`, `_`, `:`, `-`, up to 128), otherwise a UUID is
generated. Legacy error bodies include `requestId`; grep the log for it.

## Common developer problems

| Symptom                                    | Check                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Mutations fail with `INVALID_ORIGIN`       | Request has no `Origin` header, or it differs from `APP_URL`'s origin                   |
| Production start serves HTTP 500           | Missing/invalid variable; the log names it ([startup errors](../troubleshooting/startup-errors.md)) |
| Tests hit a stale server                   | Kill processes on ports 3100/3101 before `npm run test:browser`                          |
| `EADDRINUSE` in smoke/browser tests        | Same                                                                                     |
| Redis integration test refuses to run      | `TEST_REDIS_URL` must be loopback with an explicit database                              |
| Installer tests skipped                    | `jq` (and the other tools) missing from `PATH`                                           |
| Admin API returns 403 `ADMIN_REAUTH_REQUIRED` | Sign in again; step-up windows ([administrator access](../configuration/administrator-access.md)) |
| Types differ from docs                     | Next.js 16 changed APIs; read `node_modules/next/dist/docs/` for the installed version  |

## Inspecting Redis

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'arrakis:rate:*' | head
redis-cli -u "$REDIS_URL" zrevrange 'arrakis:{audit}:v1:events' 0 9
```

Keys are hashed; you cannot map a session key back to a user by name. Do not delete keys in a shared or production Redis while debugging.

## Debugging builds

[Build errors](../troubleshooting/build-errors.md). Run `npm run typecheck` and `npm run lint` before `npm run build` to get faster, clearer errors.
