# Automatic updates

## Overview

Pterodactyl servers (and any direct Node.js install that starts the supervisor) can install new releases on their own.
`scripts/deployment/updater/supervisor.mjs` runs the dashboard as its only child process and uses
`scripts/deployment/updater/updater.mjs` to find, verify, stage, install and, if needed, roll back a release. The bot ships
an identical copy under `scripts/updater/`.

The design rule is simple: **only files that a verified release manifest says belong to the application are ever
written, replaced or removed**, plus the generated `node_modules` and `.next` folders. Everything else in
`/home/container` (your `.env`, RabbitMQ certificates and keys, uploads, logs, custom folders, files you added inside
`src/`) is never moved, rewritten, deleted or re-permissioned, wherever it lives.

## What happens during an update

1. **Check.** At startup (`AUTO_UPDATE_ON_STARTUP`) and every `AUTO_UPDATE_INTERVAL_HOURS` (with ±10% jitter), the
   supervisor lists GitHub releases with a conditional request. Drafts are ignored; prereleases only on
   `AUTO_UPDATE_CHANNEL=prerelease`; `RELEASE_TAG=vX.Y.Z` holds that exact version. Nothing older than the installed
   version is ever selected.
2. **Download and verify.** The archive, its `.sha256` and, from now on, a `.manifest.json` listing every file's SHA-256 are
   downloaded only from `https://github.com/RealXKenny/Arrakis-Control-Dashboard/releases/download/<tag>/`. The archive
   must match the checksum, GitHub's own asset digest when present, and the manifest.
3. **Extract safely.** A streaming reader accepts plain files and folders only. Links, devices, absolute paths, `..`
   paths, `.env*` files (other than `.env.example`), `.git`, `.arrakis` and generated folders are refused.
4. **Check configuration.** The new `package.json` declares the settings it needs (`arrakisRelease.requiredEnv`). If one
   is missing from the environment and `.env`, the update stops with the variable's name. Your values are never changed.
5. **Build in staging.** `npm ci --ignore-scripts`, `npm run build` and `npm prune --omit=dev` run in
   `.arrakis/staging/<version>` with a minimal environment: panel secrets never reach dependency scripts.
6. **Plan.** Each file the release ships is compared with what is on disk and with what the previous release installed:
   - unchanged since it was installed: replaced;
   - **changed locally**: conflict;
   - **an unmanaged file already at a path the release now uses**: conflict;
   - reached through a symbolic link: conflict;
   - a file the new release no longer ships: removed only if unchanged, otherwise kept and logged.

   Any conflict stops the update **before anything is touched**, and every conflicting path is logged.

7. **Install.** Only now is the dashboard stopped (`SIGINT`, the same as the panel's stop). Every replaced or removed file
   is backed up to `.arrakis/backups/`, each step is journaled, files keep their existing permissions, new files get the
   release's executable bit only, and the generated folders are swapped by rename.
8. **Health check.** The new version must print its ready line (`Arrakis Control Dashboard is listening`) and still be
   running after `AUTO_UPDATE_HEALTH_SECONDS`. Then the journal is cleared and only the two newest backups are kept.
9. **Rollback.** If it exits or never becomes ready, the journal is replayed in reverse, the previous version starts again
   and the failed version is never selected automatically again. If the container stops in the middle of an install or
   before the health check passes, the same rollback runs at the next start.

The supervisor never restarts a crashing application in a loop. If the dashboard exits on its own, the supervisor exits
with the same code and Wings' normal crash handling applies. A failed check, a GitHub outage or a conflict only logs one
line; the current version keeps running.

## Settings

| Variable                     | Default      | Meaning                                                                              |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `AUTO_UPDATE_ENABLED`        | `true`       | `false` turns every check off                                                        |
| `AUTO_UPDATE_ON_STARTUP`     | `true`       | Check (and install) before the dashboard starts                                      |
| `AUTO_UPDATE_CHANNEL`        | `stable`     | `prerelease` also installs release candidates                                        |
| `RELEASE_TAG`                | `latest`     | `vX.Y.Z` pins that version; it is installed if newer and then held                   |
| `AUTO_UPDATE_INTERVAL_HOURS` | `6`          | 1 to 168                                                                             |
| `AUTO_UPDATE_WINDOW_UTC`     | empty        | `HH:MM-HH:MM` (may wrap midnight). Background installs wait for it; startup does not |
| `AUTO_UPDATE_HEALTH_SECONDS` | `120`        | 30 to 900                                                                            |
| `AUTO_UPDATE_GITHUB_TOKEN`   | empty        | Optional fine-grained token with read-only access; only raises GitHub's rate limit   |
| `UPDATE_WEBHOOK_SECRET`      | empty        | GitHub release webhook secret; see [instant updates](#instant-updates)               |
| `AUTO_UPDATE_SIGNAL_URL`     | own endpoint | Override where the release signal is read                                            |
| `AUTO_UPDATE_SIGNAL_SECONDS` | `30`         | 10 to 3600; how often the release signal is read                                     |

A malformed setting never keeps the dashboard down: updates switch off and the console says which setting to fix.

## Files the updater keeps

`.arrakis/` (owner-only permissions) holds `installed.json` (the hash of every installed file), `state.json` (release
cache, versions that failed, last check), the lock, the journal, staging, downloads and backups. Do not edit it; deleting
it is safe while no update runs (the next update rebuilds the install record from the installed release).

## Database and data

Redis data is never part of an update. Releases keep Redis changes additive, so rolling back the code leaves data the older
version still understands; any exception is called out under **Upgrade Notes** in the changelog, and such a release should
be installed by hand after a [Redis backup](../administration/backups.md).

## Instant updates

By default each app checks GitHub every `AUTO_UPDATE_INTERVAL_HOURS`. With a release webhook, both apps install a new
release within about 30 seconds of it being published instead:

1. Pick a random secret of at least 32 characters and set it as `UPDATE_WEBHOOK_SECRET` on the **dashboard** server.
2. In each repository (the bot and the dashboard) open _Settings → Webhooks → Add webhook_ and set the payload URL to
   `https://<your dashboard>/api/v2/updates/github`, the content type to `application/json`, the same secret, and
   _Let me select individual events_ → **Releases** only.
3. On the **bot** server set `AUTO_UPDATE_SIGNAL_URL` to `https://<your dashboard>/api/v2/updates/signal`. The dashboard
   listens on its own endpoint without any setting.

GitHub signs every delivery; the dashboard rejects any delivery without a valid HMAC-SHA256 signature and records only
which version of which app was published. That record is a hint to check now, not an instruction: the updater still
picks the release from GitHub's own list and verifies the checksum, digest and manifest as always, so a forged or replayed
signal can at most cause an early check. The maintenance window (`AUTO_UPDATE_WINDOW_UTC`), the version pin, the channel
and the health check apply exactly as they do to scheduled checks, and the scheduled check stays as the fallback when the
dashboard is unreachable. `AUTO_UPDATE_SIGNAL_SECONDS` (default 30, 10 to 3600) sets how often the signal is read.

## Migrating an existing server

Servers installed before automatic updates (2.0.0) have no updater, start the application directly and ignore the new
variables. Moving one over is a one-time change:

1. Back up Redis and download a copy of `/home/container` (at least `.env` and any certificates).
2. Import the new egg from the latest release over the old one (_Admin → Nests → Import Egg_, choosing the existing egg to
   update it).
3. Reinstall the server (_Settings → Reinstall Server_). On a 2.0.0 install the installer verifies the newest release and
   adds only its updater files and `.arrakis/bootstrap.json`, which holds the release settings an old `package.json`
   lacks. No existing file is changed, so `.env`, certificates and your own files stay as they are.
4. Set the startup command under _Admin → Servers → (server) → Startup_ to
   `cd /home/container && exec node scripts/deployment/updater/supervisor.mjs`. Importing an egg does not change the startup command of a server
   that already exists.
5. Add the new variables if the panel did not (defaults above), and set `AUTO_UPDATE_ENABLED=false` first if you want to
   watch the first update by hand.
6. Restart. The first check reads the installed release's own checksummed archive to learn which files it manages, so
   files you changed are detected as conflicts rather than overwritten, and then installs the newest release. If your
   installed version has no checksummed archive (very old releases), the check stops and says so; install a current
   release once by hand.

**Reinstall** from the panel never overwrites an existing installation: once the updater is in place, the installer sees
it and exits without changing anything. To start completely fresh, back up your files, empty the server's files, then reinstall.

## Resolving a conflict

The console lists each path, for example `Conflict: src/app/page.tsx (modified locally since it was installed)`.

- To keep your change: leave it; the dashboard keeps running the current version, and the update is retried later.
- To accept the release: move your file somewhere outside the managed paths (or restore it from the release archive),
  then restart.
- An unmanaged file at a new path: rename or move it; the release needs that path.

## Manual rollback

Set `RELEASE_TAG` to the version you want **and** follow [rollback](rollback.md): automatic updates never downgrade,
because older code may not understand newer data.

## Not verified

The updater is covered by automated tests (custom files in nested folders and paths with spaces, permissions and
certificates preserved, conflicts, corrupted and hostile archives, checksum and manifest mismatches, symbolic links,
missing configuration, build failures, GitHub outages, locking, rollback and interrupted-install recovery, signal
forwarding). It has **not** yet been run on a live Pterodactyl panel with Wings; try it on a throwaway server first.
