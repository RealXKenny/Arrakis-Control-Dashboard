# Quick start (local development)

Run the dashboard on your own machine to explore it. This is **not** a production setup; for that use
[End-to-end setup](end-to-end-redblink-setup.md) or [Production](../installation/production.md).

## Prerequisites

[Node.js 22+](https://nodejs.org/), Git, a Discord application ([guide](../configuration/discord-oauth.md)) and, for live
data, a reachable Dune Console with an API key. Redis is optional in development: without `REDIS_URL` the app keeps
sessions and rate limits in memory, which are lost on restart and are never used in production.

## 1. Get the code and dependencies

Linux or macOS (bash):

```bash
git clone https://github.com/RealXKenny/Arrakis-Control-Dashboard.git
cd Arrakis-Control-Dashboard
npm ci
cp .env.example .env
```

Windows (PowerShell):

```powershell
git clone https://github.com/RealXKenny/Arrakis-Control-Dashboard.git
Set-Location Arrakis-Control-Dashboard
npm ci
Copy-Item .env.example .env
```

## 2. Edit `.env`

Minimum for signing in locally (use your own values; keep `.env` out of Git):

| Variable                                         | Local value                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `APP_URL`                                        | `http://127.0.0.1:2008`                                              |
| `AUTH_SECRET`                                    | 32 or more random characters (see [secrets](../security/secrets-management.md)) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`     | From the Discord developer portal                                    |
| `DISCORD_GUILD_ID`, `VERIFIED_MEMBER_ROLE_ID`    | Your Discord server and the role that grants access                  |
| `CONSOLE_URL`, `CONSOLE_API_KEY`, `ADAPTER_TOKEN` | Your Console; needed for live data                                  |

Add `http://127.0.0.1:2008/api/auth/callback/discord` as a redirect URL in the Discord application. In development
`ADMIN_DISCORD_IDS` may stay empty; the project owner's Discord ID is then the only administrator. Set it to your own
Discord user ID to test `/admin`.

## 3. Start

```bash
npm run dev
```

The server binds `SERVER_HOSTNAME:SERVER_PORT` (default `127.0.0.1:2008`) and prints
`Arrakis Control Dashboard is listening` once an HTTP check passes. Open <http://127.0.0.1:2008>.

## Verify

- The landing page loads without signing in.
- **Sign in** sends you to Discord and back to `/post-login`, then the portal.
- The startup log shows `Starting dashboard`, and warns if the Console is unreachable (the site still starts).

Next: [first run](first-run.md) · [first administrator login](first-admin-login.md) · [development workflow](../development/development-workflow.md).
