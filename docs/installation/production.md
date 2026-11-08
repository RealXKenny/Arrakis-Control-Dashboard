# Production installation (Node.js on Linux or Windows)

## Overview

Run the built application with `npm start` behind an HTTPS reverse proxy, with Redis and the production variables set.
For the full operational checklist see [deployment checklist](../deployment/deployment-checklist.md).

## Requirements

[Requirements](../getting-started/requirements.md), a Redis you control, a public domain with TLS, and the values listed in
[environment variables](../configuration/environment-variables.md#required-in-production).

## 1. Get a verified release

Each GitHub Release publishes `arrakis-control-dashboard-<version>.tar.gz` and its `.sha256` (plus the Pterodactyl egg).
Linux (bash):

```bash
VERSION=2.0.0   # the release you intend to run
BASE=https://github.com/RealXKenny/Arrakis-Control-Dashboard/releases/download/v$VERSION
curl -fsSLO $BASE/arrakis-control-dashboard-$VERSION.tar.gz
curl -fsSLO $BASE/arrakis-control-dashboard-$VERSION.tar.gz.sha256
sha256sum --check arrakis-control-dashboard-$VERSION.tar.gz.sha256
mkdir -p dashboard && tar -xzf arrakis-control-dashboard-$VERSION.tar.gz --strip-components=1 -C dashboard
```

Windows (PowerShell):

```powershell
$v = '2.0.0'
$base = "https://github.com/RealXKenny/Arrakis-Control-Dashboard/releases/download/v$v"
Invoke-WebRequest "$base/arrakis-control-dashboard-$v.tar.gz" -OutFile "arrakis-control-dashboard-$v.tar.gz"
Invoke-WebRequest "$base/arrakis-control-dashboard-$v.tar.gz.sha256" -OutFile "arrakis-control-dashboard-$v.tar.gz.sha256"
$expected = (Get-Content "arrakis-control-dashboard-$v.tar.gz.sha256").Split(' ')[0]
$actual = (Get-FileHash "arrakis-control-dashboard-$v.tar.gz" -Algorithm SHA256).Hash.ToLower()
if ($expected -ne $actual) { throw 'Checksum mismatch: do not use this archive.' }
New-Item -ItemType Directory dashboard | Out-Null
tar -xzf "arrakis-control-dashboard-$v.tar.gz" --strip-components=1 -C dashboard
```

The checksum proves the archive is the one the release published, not who published it ([release verification](../security/release-verification.md)).
Alternatively clone the repository and check out the release tag.

## 2. Install and build

```bash
cd dashboard
npm ci --ignore-scripts
npm run build
```

`--ignore-scripts` mirrors the egg installer; the build needs no dependency install scripts. Builds work without deployment
secrets.

## 3. Configure

Create `.env` from `.env.example` (never commit it) or provide the variables through your service manager. You
do not need to set `NODE_ENV`: `npm start` runs `next start`, which runs in production mode. Use
[configuration examples](../reference/configuration-examples.md) as a base and
[secrets management](../security/secrets-management.md) for storage.

## 4. Start

```bash
npm start
```

Wait for `Arrakis Control Dashboard is listening`. Bind to loopback (`SERVER_HOSTNAME=127.0.0.1`) when a proxy runs on the same host.

### Run as a service

Linux example (systemd; adapt user and paths, this unit is an **example**, not shipped by the project):

```ini
[Unit]
Description=Arrakis Control Dashboard
After=network-online.target redis-server.service

[Service]
User=arrakis
WorkingDirectory=/opt/arrakis/dashboard
EnvironmentFile=/etc/arrakis/dashboard.env
ExecStart=/usr/bin/node scripts/server-launcher.mjs start
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Put the secrets in `/etc/arrakis/dashboard.env` owned by root with mode `0640` readable by the service group. On Windows, run
`npm start` from a process supervisor of your choice; the project does not ship a Windows service wrapper.

## Verify

[First run](../getting-started/first-run.md) checks, then the [post-deployment checks](../deployment/deployment-checklist.md#3-postdeployment).

## Security

Never expose the Node port directly; use the [reverse proxy](reverse-proxy.md) and [production hardening](../security/production-hardening.md).

## Updating and maintenance

[Updating](updating.md) · [Monitoring](../administration/monitoring.md) · [Backups](../administration/backups.md)

## Troubleshooting

[Startup errors](../troubleshooting/startup-errors.md) · [Redis errors](../troubleshooting/redis-errors.md)
