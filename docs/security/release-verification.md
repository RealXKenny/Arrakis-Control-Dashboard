# Release verification

## What a release contains

Every stable version on `main` that passes CI produces a GitHub Release with three assets (`.github/workflows/release.yml`):

| Asset                                          | Purpose                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `arrakis-control-dashboard-<version>.tar.gz`   | `git archive` of the exact release commit, prefix `arrakis-control-dashboard/` |
| `arrakis-control-dashboard-<version>.tar.gz.sha256` | `sha256sum` output for the archive (re-verified by the workflow) |
| `egg-arrakis-control-dashboard.json`           | Pterodactyl egg generated from the same commit               |

The release job runs only after successful CI for a push to `main` in this repository, re-checks that the commit is on `main`,
and requires a strictly greater stable SemVer and a non-empty `## Patch Notes vX.Y.Z` section in `CHANGELOG.md`.

## What the installer does (egg)

1. Resolves `latest` or the exact `RELEASE_TAG` (`^v[0-9]+\.[0-9]+\.[0-9]+$`, matched as a whole string).
2. Downloads the archive and its `.sha256` (names must match the strict patterns), validates the digest format, and runs `sha256sum --check`.
3. **Fails closed** if either asset is missing or the digest does not match. Only when a release has *neither* asset and the operator set
   `ALLOW_UNVERIFIED_RELEASE=true` exactly does it install GitHub's source tarball with a loud warning. Nothing sets that variable for you.
4. Inspects the archive before extracting: only regular files and directories, no absolute or `..` paths; extracts with
   `--no-same-owner --no-same-permissions`; re-checks that no symlink leaves the install directory.
5. Builds with `npm ci --ignore-scripts`, `npm run build`, `npm prune --omit=dev`, telemetry off.

## Verify by hand

Linux:

```bash
sha256sum --check arrakis-control-dashboard-<version>.tar.gz.sha256
```

Windows (PowerShell): compare `(Get-FileHash <archive> -Algorithm SHA256).Hash.ToLower()` with the first field of the `.sha256` file
(full script in [production installation](../installation/production.md#1-get-a-verified-release)).

## What this does and does not prove

| Proves                                                                      | Does not prove                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| The archive you hold is the one the release page published                   | Who published it, or that the release page itself is genuine |
| The installer will not run an altered or incomplete download                 | That the source code is free of vulnerabilities               |

## Provenance (follow-up, not implemented)

GitHub build-provenance attestation (`actions/attest-build-provenance` and `gh attestation verify`) would add a signed statement of which
workflow built which artifact. It needs `id-token: write` and `attestations: write` on the release job, a pinned attestation action, and
the `gh` CLI in the installer container, and a verification failure must not strand legitimate installs. It is documented as owner follow-up work.
Until then, protect the repository itself: branch protection on `main`, required reviews, and restricted release permissions.

## Related

[Deployment: release integrity](../deployment/production-release.md) · [GitHub Actions](../deployment/github-actions.md)
