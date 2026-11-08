# Production release

## Cutting a release

1. On a branch: bump the stable SemVer in `package.json` **and** `package-lock.json`, and add a non-empty `## Patch Notes vX.Y.Z` section to `CHANGELOG.md`
   (sections: New Features, Improvements, Fixes, Security, Privacy, Removed, Upgrade Notes, Community Contributions; omit empty ones).
2. Open a pull request; all CI jobs must be green ([GitHub Actions](github-actions.md)). Run the relevant [staging checks](staging.md).
3. Merge to `main`. Successful `main` CI triggers the release workflow, which tags `vX.Y.Z` and publishes the assets. Only a new stable version
   creates a release; re-pushing the same version does nothing.
4. Verify the release page: archive, `.sha256`, egg. Run `sha256sum --check` yourself on one download ([release verification](../security/release-verification.md)).

A unit test requires that the package version has a matching, non-empty changelog section.

## Contents of a release

| Asset                                         | Used by                                                    |
| --------------------------------------------- | ---------------------------------------------------------- |
| `arrakis-control-dashboard-<version>.tar.gz`  | Pterodactyl installer; manual installs                      |
| `arrakis-control-dashboard-<version>.tar.gz.sha256` | Installer and manual verification                      |
| `egg-arrakis-control-dashboard.json`          | Pterodactyl import (built from the exact release commit)    |

There is no container image and no GHCR package.

## Deploying a release

Pterodactyl: set `RELEASE_TAG` and reinstall ([Pterodactyl](../installation/pterodactyl.md)). Node.js: [updating](../installation/updating.md).
Follow the [deployment checklist](deployment-checklist.md) and keep the previous version number for [rollback](rollback.md).

## Release integrity

Integrity relies on the SHA-256 pair published with each release and on protecting `main` and release permissions. There is no
signature or provenance attestation yet ([release verification](../security/release-verification.md#provenance-follow-up-not-implemented)).
Older releases without the archive pair do not install by default.
