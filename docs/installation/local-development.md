# Local development

## Overview

Run the dashboard with hot reload for development or evaluation. Use [Quick start](../getting-started/quick-start.md) first.

## Requirements

Node.js 22+, npm, Git. Optional: a throwaway Redis (see below), Playwright's Chromium for browser tests.

## Install and run

Linux/macOS (bash):

```bash
git clone https://github.com/RealXKenny/Arrakis-Control-Dashboard.git
cd Arrakis-Control-Dashboard
npm ci
cp .env.example .env
npm run dev
```

Windows (PowerShell):

```powershell
git clone https://github.com/RealXKenny/Arrakis-Control-Dashboard.git
Set-Location Arrakis-Control-Dashboard
npm ci
Copy-Item .env.example .env
npm run dev
```

`npm run dev` runs `node scripts/server-launcher.mjs dev`. It loads `.env`, binds `SERVER_HOSTNAME`:`SERVER_PORT`
(default `127.0.0.1:2008`) and starts `next dev`.

## Behaviour that differs from production

| Area                    | Development                                                                                  | Production                                              |
| ----------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Redis                   | Optional. Without `REDIS_URL`, sessions and rate limits use process memory                   | Required; storage failure makes rate limits fail closed |
| Administrators          | If `ADMIN_DISCORD_IDS` is empty, the project owner's built-in ID is the administrator         | `ADMIN_DISCORD_IDS` is required                         |
| Cookie names            | `dashboard_session`                                                                           | `__Host-dashboard_session`                              |
| Startup validation      | Not enforced                                                                                  | Enforced; invalid config stops serving                  |
| Origin checks           | The configured `APP_URL` origin **and** the request's own origin are accepted for mutations   | Only `APP_URL`'s origin                                 |

## Using a real Redis locally (optional)

Use any Redis 7 on loopback and put `REDIS_URL=redis://127.0.0.1:6379/0` in `.env`. Integration tests flush a database,
so never point `TEST_REDIS_URL` at data you want to keep ([Redis integration tests](../development/testing.md#redis-integration-tests)).

## Verify

`npm run typecheck`, `npm run lint`, `npm test` (see [testing](../development/testing.md)).

## Troubleshooting

[Startup errors](../troubleshooting/startup-errors.md) · [Build errors](../troubleshooting/build-errors.md). A stale server on a test port (3100/3101) can cause `EADDRINUSE`; stop it before running browser tests.
