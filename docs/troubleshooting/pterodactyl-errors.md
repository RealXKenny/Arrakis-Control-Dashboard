# Pterodactyl errors

Setup: [Pterodactyl](../installation/pterodactyl.md).

## Installation

| Message / symptom                                                                 | Cause                                                              | Fix                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `RELEASE_TAG must be latest or a version such as v2.1.0.`                         | Invalid pin (extra text, missing `v`, multi-line)                  | Use `latest` or exactly `vX.Y.Z`                                         |
| `This release has no complete published checksum, so it cannot be verified…`      | Release lacks the archive/`.sha256` pair                            | Install a newer release. `ALLOW_UNVERIFIED_RELEASE=true` is a last resort for old releases with no assets |
| `sha256sum --check` failure (install exits non-zero)                              | Corrupted or altered download                                       | Retry once; if it persists, treat as suspicious and verify the release page |
| `The release archive contains links or special files…`                            | The archive is not a normal release                                  | Do not install; report ([SECURITY.md](../../SECURITY.md))                  |
| `…absolute or parent-directory paths…`                                            | Same                                                                | Same                                                                      |
| `curl: (22)` / rate-limit from GitHub API                                         | Unauthenticated GitHub API limit shared by the node's IP, or no outbound HTTPS | Wait; allow outbound HTTPS; pin `RELEASE_TAG`                              |
| `npm ci` failures                                                                 | Registry unreachable, disk full                                      | Check egress and disk                                                     |
| Build killed / out of memory                                                      | A Next.js production build needs memory and time                      | Raise the server's memory limit for the install                            |

## Startup

| Symptom                                           | Cause / fix                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Stays "starting", never "running"                 | The panel waits for `Arrakis Control Dashboard is listening`. Check the console for `Production configuration is invalid…` ([startup errors](startup-errors.md)) |
| Page unreachable from outside                     | Wings allocation/port not mapped, `APP_URL` mismatch, or `SERVER_HOSTNAME` not `0.0.0.0` (the egg default) |
| Required variable "missing" though entered        | Hidden variables are only editable by a **panel administrator** (Admin → Servers → Startup)                |
| Variable you added is ignored                     | The egg passes only variables it defines; edit the egg for new ones                                       |
| `REDIS_URL` not accepted in the panel             | The egg rule is "required, string"; check the value (no query string; percent-encode the password)             |
| Crash loop after update                           | New release needs a new variable. Check `CHANGELOG.md` Upgrade Notes; pin the previous `RELEASE_TAG` ([rollback](../deployment/rollback.md)) |

## Where to look

The panel console (stdout), the installation log from the install screen, and your shipped audit lines. Remember hidden variables are not encrypted: a
user with file or console access to the server can still read them.
