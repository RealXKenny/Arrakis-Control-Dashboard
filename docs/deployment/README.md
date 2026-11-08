# Deployment

| Guide                                                   | Covers                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Deployment checklist](deployment-checklist.md)         | Predeployment, deployment, postdeployment, rollback — the step-by-step list |
| [Staging](staging.md)                                   | The verification you must do on real infrastructure before launch           |
| [GitHub Actions](github-actions.md)                     | What CI and the release workflow do, how to verify them                     |
| [Production release](production-release.md)             | How a release is cut and what it contains                                   |
| [Migration](migration.md)                               | `redis:rekey` and `marketplace:rekey` procedures, secret rotation           |
| [Rollback](rollback.md)                                 | Code, release, data and secret rollback                                     |

Release integrity and checksum verification are explained in [Release verification](../security/release-verification.md).

## Order of work for a first production launch

1. [Staging](staging.md) on a throwaway deployment, with real Discord, Redis and (if used) Pterodactyl.
2. [Production hardening](../security/production-hardening.md).
3. [Deployment checklist](deployment-checklist.md) sections 1 to 3.
4. Decide the open items in [Security overview](../security/security-overview.md#known-limitations-and-accepted-risks).
