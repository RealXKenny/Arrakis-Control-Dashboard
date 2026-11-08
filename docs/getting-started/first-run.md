# First run

## What a healthy start looks like

The launcher (`scripts/server-launcher.mjs`) starts Next.js, then probes the local page for up to 60 seconds and prints
`Arrakis Control Dashboard is listening`. The Pterodactyl egg uses that line as its "server is running" marker.

Startup log order (from `src/instrumentation.ts`):

1. `Starting dashboard` with the environment and Node version.
2. `Runtime configuration validated` (production only validates; see below).
3. Warnings from the Redis transport check, if any (plain-text `redis://` to a public-looking host, missing password).
4. `Redis pool configured for dashboard data` when `REDIS_URL` is set.
5. `Connecting to Dune Console` → `Dune Console connection ready`, then `Population recorder started`.

## Production fails closed

In production (`NODE_ENV=production`, which `npm start` sets) an invalid configuration **stops the site from serving**:
every request returns HTTP 500 and the log shows `Production configuration is invalid; refusing to start` followed by the
variable that is missing or malformed (never its value). Required: `CONSOLE_URL`, `CONSOLE_API_KEY`, `ADAPTER_TOKEN`,
`DISCORD_GUILD_ID`, `VERIFIED_MEMBER_ROLE_ID`, `APP_URL`, `REDIS_URL`, `AUTH_SECRET`, `DISCORD_CLIENT_ID`,
`DISCORD_CLIENT_SECRET` and `ADMIN_DISCORD_IDS`. See [startup errors](../troubleshooting/startup-errors.md).

A failure of the **Console** at startup is only logged (`Dashboard startup failed`); the site still serves and retries.

## Quick checks

Linux (bash):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2008/                      # 200
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2008/api/v2/admin/overview  # 401 when signed out
```

Windows (PowerShell):

```powershell
(Invoke-WebRequest http://127.0.0.1:2008/ -UseBasicParsing).StatusCode
try { Invoke-WebRequest http://127.0.0.1:2008/api/v2/admin/overview -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
```

Expected: `200`, then `401`.

## Related

[First administrator login](first-admin-login.md) · [Startup errors](../troubleshooting/startup-errors.md) · [Logging](../configuration/logging.md)
