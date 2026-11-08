# Startup errors

## Production serves HTTP 500 on every request

Cause: the production configuration check failed. The server **deliberately does not serve** (fail closed). The log contains, without any secret value:

```text
Production configuration is invalid; refusing to start · {"reason":"Missing server environment configuration: AUTH_SECRET"}
```

| `reason` contains                                              | Fix                                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Missing server environment configuration: <NAMES>`            | Set the named variables ([required list](../configuration/environment-variables.md#required-in-production)); `ADMIN_DISCORD_IDS` is mandatory |
| `Invalid server environment configuration: <NAME>`             | The value is malformed (for example `AUTH_SECRET` under 32 characters, `REDIS_URL` with a query string, `ADMIN_DISCORD_IDS` with non-numeric text) |
| `REDIS_URL is plain-text and unauthenticated on a public-looking host…` | Add a password or use `rediss://`; do not set `REDIS_ALLOW_INSECURE` unless you accept the risk |
| `REDIS_REQUIRE_TLS is enabled: REDIS_URL must use rediss://`    | Use `rediss://` or set `REDIS_REQUIRE_TLS=false`                                                 |
| `Invalid production URL configuration: APP_URL` / `CONSOLE_URL` | No credentials, no hash; `APP_URL` has no query/path                                           |
| `Production HTTPS is required: APP_URL`                         | Use `https://` (plain `http://` only for loopback)                                              |

Fix the variable and **restart**; the check runs once at startup.

## `Dashboard startup failed` (but the site works)

The Console warm-up or another optional step failed. The site still serves; sign-in and Redis features work. Check
[Console connection](console-connection.md). The log line shows only a generic message by design.

## `EADDRINUSE`

Another process holds `SERVER_PORT`. Find it (`ss -ltnp | grep 2008` on Linux, `Get-NetTCPConnection -LocalPort 2008` in PowerShell) and stop it or change `SERVER_PORT`.

## Never reaches "listening"

The launcher probes the local page for up to 60 seconds. Look for build problems (`.next` missing: run `npm run build`), a wrong `SERVER_HOSTNAME`, or the invalid-configuration
state above (the probe never succeeds while every page is 500).

## "Invalid server environment configuration" at build time

Builds work without deployment secrets, but a malformed value present at build (for example an invalid `REDIS_CLUSTER_NODES`) still fails. Remove or fix it.

## Related

[First run](../getting-started/first-run.md) · [Environment variables](../configuration/environment-variables.md)
