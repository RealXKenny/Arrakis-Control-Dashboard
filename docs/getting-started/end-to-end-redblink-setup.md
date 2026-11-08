# End-to-end setup: RedBlink Dune Docker + Arrakis Control Dashboard

This walkthrough takes an administrator from an empty Linux host to a dashboard that talks to a RedBlink Dune Docker
Console. It keeps the two projects clearly apart:

- **RedBlink Dune Docker** (upstream, [Red-Blink/dune-awakening-selfhost-docker](https://github.com/Red-Blink/dune-awakening-selfhost-docker))
  runs the game server and the Console. You install and update it with *its* tools.
- **Arrakis Control Dashboard** (this repository) is installed separately and only *calls* the Console.

> **What this guide could verify.** Dashboard steps are checked against this repository's code. RedBlink steps are
> checked against the RedBlink `docs/` folder (operator guide, API keys, Discord adapter, system overview). That folder
> does **not** contain the one-line installer command or the requirements/ports tables, which live in the upstream
> root README, so those are referenced rather than reproduced. Always follow the upstream README for installation and
> the upstream docs for the current Console behaviour.

Platform labels: **[Linux/bash]** run on the host; **[Browser]** in a web browser; **[Dashboard `.env`]** a file edit.

## 0. Plan the layout

| Component              | Typical location                                  | Listens on                                                            |
| ---------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| RedBlink game stack    | Docker on the game host                           | Game ports per upstream README                                        |
| RedBlink Console (Web) | Same host                                         | `8088` by default (upstream: `ADMIN_BIND_PORT`, Settings → Web Console Port) |
| Redis                  | Dashboard host, loopback or private network       | `6379` (never public)                                                 |
| Dashboard              | Dashboard host (can be the game host)             | `SERVER_HOSTNAME:SERVER_PORT` (default `127.0.0.1:2008`) behind HTTPS |
| Reverse proxy          | Dashboard host                                    | `443`                                                                 |

The Console must be reachable **from the dashboard host** at `CONSOLE_URL`. If both run on one machine, that is
`http://127.0.0.1:8088` (adjust if you changed the port). Do not expose the Console port to untrusted users.

## 1. Prepare the host

1. Use a supported, patched Linux host and create a non-root user for the dashboard.
2. Install Docker following Docker's official instructions for your distribution; RedBlink Dune Docker requires it
   (see the upstream README for exact version and resource requirements).
3. Install Node.js 22+ and Git for the dashboard ([requirements](requirements.md)).
4. Plan firewall rules: allow only what upstream's *Ports* table requires for players, `443` for the dashboard, and keep
   `8088` and Redis private.

## 2. Install RedBlink Dune Docker (upstream)

**[Linux/bash]** Follow the installer instructions in the upstream README, then check the stack with the upstream `dune`
CLI. The CLI commands documented in the RedBlink system overview include:

```bash
dune status      # overall state
dune ps          # containers
dune servers     # game server partitions
dune ports       # port status
```

After installation the installer prints the Console's URL and a generated admin password. If you lose it, upstream
documents that it is stored at `runtime/secrets/admin-web-password.txt` inside the RedBlink checkout:

```bash
cat runtime/secrets/admin-web-password.txt
```

Persistent data (all inside the RedBlink checkout, per upstream): `runtime/secrets/` (credentials, includes the Funcom
token and admin password), `runtime/generated/` (derived state) and `.env`. Back these up with upstream's *system
backups* (see [backups](../administration/backups.md)).

## 3. Create Console API keys

**[Browser]** Sign in to the Console (`http://<console-host>:8088`) with the admin password, open **Settings → API Keys**.

Upstream keys start with **no** access; you grant a level (None / Read / Read+write) or an explicit action list per
namespace. The dashboard's member features only read, except guild membership changes. Based on the Console routes the
dashboard calls (`/api/players`, `/api/guilds`, `/api/exchange/*`, `/api/vehicles`, `/api/map/markers`,
`/api/realtime/objects`, `/api/admin/landsraad`, `/api/players/online`), create:

| Key                | Env variable            | Suggested scopes                                                                                                                     |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard (member) | `CONSOLE_API_KEY`       | Read on `players`, `bases`, `vehicles`, `guilds`, `exchange`, `maps`, `realtime`, `server`, `landsraad`; for guild-leader actions add the `guilds` actions you need (`guilds:membership`, `guilds:rank`) as a Custom list |
| Dashboard (admin)  | `ADMIN_CONSOLE_API_KEY` | Only what your administrators need. **A separate key**, never the member key. Optional; administration stays disabled without it |

Confirm namespace and action names in the Console's key editor; they are authoritative. Copy each key when it is shown.
The Console refuses setup, database, settings and community namespaces to API keys by design. Details:
[Dune Console](../configuration/dune-console.md).

## 4. Enable the Discord adapter and get `ADAPTER_TOKEN`

The dashboard also uses the Console's built-in Discord adapter (for example `/api/integrations/discord/players/me`). It is
disabled by default upstream.

**[Linux/bash]** in the RedBlink checkout (commands from the upstream Discord adapter guide):

```bash
# 1. Add to RedBlink's .env (do not duplicate keys in the compose file)
#    DUNE_DISCORD_ADAPTER_ENABLED=true
#    DUNE_BOT_API_TOKEN_FILE=/repo/runtime/secrets/bot-api-token.txt

# 2. Create the token file
mkdir -p runtime/secrets
head -c 36 /dev/urandom | base64 | tr -d '\n' > runtime/secrets/bot-api-token.txt
chmod 600 runtime/secrets/bot-api-token.txt

# 3. Rebuild the Console
docker compose -f docker-compose.web.yml up -d --build redblink-dune-docker-console
```

Verify (upstream's own check):

```bash
TOKEN=$(cat runtime/secrets/bot-api-token.txt)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8088/api/integrations/discord/health
```

Expect JSON with `"ok": true` and `"enabled": true`. The dashboard's `ADAPTER_TOKEN` is the **same value** as this token.
Keep it different from both Console API keys. The adapter's role variables (`DISCORD_OBSERVER_ROLE_IDS`, etc.) matter
for the upstream Discord bot; the dashboard sends its own checks with the bearer token only.

## 5. Install and secure Redis

Use your distribution's Redis 7 package (or any Redis 7 deployment). In `redis.conf`: bind to loopback or a private
interface, set a password with `requirepass`, and enable persistence (`appendonly yes`) **(standard Redis configuration,
not specific to this project)**. Then:

```bash
redis-cli -a '<REDIS_PASSWORD>' ping     # PONG
```

Your URL is `redis://:<REDIS_PASSWORD>@127.0.0.1:6379/0`. For a network between hosts use TLS (`rediss://`). More:
[Redis](../configuration/redis.md), [Redis security](../security/redis-security.md).

## 6. Create the Discord application

Follow [Discord OAuth](../configuration/discord-oauth.md): create the application, copy the client ID and secret, add
the redirect URL `https://<your-domain>/api/auth/callback/discord`, and note your server (guild) ID and the member role ID.

## 7. Install the dashboard

**[Linux/bash]**

```bash
git clone https://github.com/RealXKenny/Arrakis-Control-Dashboard.git
cd Arrakis-Control-Dashboard
npm ci
cp .env.example .env
chmod 600 .env
```

**[Dashboard `.env`]** (replace every `<...>`; generate secrets with `openssl rand -base64 48`):

```dotenv
SERVER_HOSTNAME=127.0.0.1
SERVER_PORT=2008
TRUSTED_PROXY_COUNT=1

APP_URL=https://<your-domain>
AUTH_SECRET=<48+ random characters>
OWNER_KEY_SECRET=<another random value, 32+ characters>

DISCORD_CLIENT_ID=<application id>
DISCORD_CLIENT_SECRET=<application secret>
DISCORD_GUILD_ID=<your server id>
VERIFIED_MEMBER_ROLE_ID=<member role id>
ADMIN_DISCORD_IDS=<your discord user id>

CONSOLE_URL=http://127.0.0.1:8088
CONSOLE_API_KEY=<member key>
ADMIN_CONSOLE_API_KEY=<admin key, optional>
ADAPTER_TOKEN=<contents of bot-api-token.txt>

REDIS_URL=redis://:<REDIS_PASSWORD>@127.0.0.1:6379/0
```

Build and start:

```bash
npm run build
npm start
```

For a managed service, run `npm start` under systemd or use the [Pterodactyl egg](../installation/pterodactyl.md); see
[production installation](../installation/production.md).

## 8. Put HTTPS in front

Terminate TLS at Nginx (or a load balancer) and proxy to `127.0.0.1:2008`. Use `TRUSTED_PROXY_COUNT=1` for one proxy.
See [reverse proxy](../installation/reverse-proxy.md).

## 9. Verify

1. Startup log shows `Runtime configuration validated`, `Redis pool configured for dashboard data`,
   `Dune Console connection ready` and `Arrakis Control Dashboard is listening`.
2. `curl -sS https://<your-domain>/ -o /dev/null -w "%{http_code}\n"` returns `200`.
3. Sign in with Discord, land on the portal, and see your character and server status.
4. Open `/admin`; the *Overview* shows the admin key and adapter as configured.
5. If data is missing, work through [Console connection problems](../troubleshooting/console-connection.md).

## 10. Update, back up, secure

- **Dashboard:** [updating](../installation/updating.md). **RedBlink:** upstream `dune update` (game server) and
  `dune self-update` (the RedBlink stack); they are independent of the dashboard.
- **Back up** Redis ([backups](../administration/backups.md)) and RedBlink's system backups (GPG-encrypted; keep the
  passphrase separately; upstream cannot recover one without it).
- **Harden** with [production hardening](../security/production-hardening.md) and walk the
  [deployment checklist](../deployment/deployment-checklist.md).

## Troubleshooting quick table

| Symptom                                   | Likely cause                                                       | See                                                              |
| ----------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Site answers HTTP 500 after start         | Missing/invalid production variable                                | [Startup errors](../troubleshooting/startup-errors.md)            |
| Adapter 404 / 401 / 503                   | Adapter disabled / token mismatch / token missing                  | [Console connection](../troubleshooting/console-connection.md)    |
| Discord login loops or is refused         | Redirect URL, missing role, wrong guild                            | [Discord login](../troubleshooting/discord-login.md)              |
| Pages empty, "unavailable"                | Console unreachable from dashboard host, key scopes too narrow     | [Console connection](../troubleshooting/console-connection.md)    |
