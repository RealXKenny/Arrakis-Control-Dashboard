# Updating

## Overview

Updating the dashboard is independent of updating the game server. Dashboard updates replace application code; data lives
in Redis and is untouched unless the release notes (`CHANGELOG.md`, section `## Patch Notes vX.Y.Z`) say a migration is needed.
Sessions that lack a verification stamp (very old ones) get no grace and sign in once after a deployment.

## Before you update

1. Read the release's patch notes for **Upgrade Notes**.
2. Back up Redis ([backups](../administration/backups.md)).
3. Note the current version so you can [roll back](../deployment/rollback.md).

## Pterodactyl

Change `RELEASE_TAG` to the new `vX.Y.Z` and **Reinstall**. Leaving `latest` installs the newest release at reinstall time.
See [Pterodactyl](pterodactyl.md).

## Node.js on Linux or Windows

Download and verify the new archive as in [production installation](production.md#1-get-a-verified-release), extract it into a
new directory, copy your `.env`, then:

```bash
npm ci --ignore-scripts
npm run build
# stop the old process, switch the service to the new directory, start it
npm start
```

Or from a Git checkout:

```bash
git fetch --tags
git checkout v<NEW_VERSION>
npm ci --ignore-scripts
npm run build
```

Restart the service afterwards. Environment variables introduced by the release must be set before restarting; production
refuses to serve if a required one is missing ([startup errors](../troubleshooting/startup-errors.md)).

## After the update

Run the [post-deployment checks](../deployment/deployment-checklist.md#3-postdeployment). If the release changed marketplace
ownership keys, follow [migration](../deployment/migration.md).

## RedBlink / Console

Update the game server with upstream's `dune update` and the RedBlink stack with `dune self-update`
([integration guide](../integrations/redblink-dune-docker.md#updating-both-systems)). After a Console update, re-check API key
scopes and the adapter token.
