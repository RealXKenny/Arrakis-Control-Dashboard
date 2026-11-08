# Disaster recovery

The dashboard's code is reproducible from a GitHub Release; its state is Redis plus your configuration. Plan around those.

## Scenarios

| Lost                                   | Impact                                                                  | Recover                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The dashboard host / container         | Site down; no data lost                                                  | Reinstall the pinned release ([Pterodactyl](../installation/pterodactyl.md) / [production](../installation/production.md)), restore variables, start |
| Redis, with a backup                   | Data since the snapshot lost                                             | [Restore](backups.md#restore); members created after it sign in again                            |
| Redis, no backup                       | Sessions, accounts' passwords, guild applications/listings, marketplace, audit copy gone | Start empty Redis; members sign in with Discord and choose passwords again; leaders republish listings; marketplace restarts empty |
| Configuration / secrets                | Server refuses to start, or members signed out                           | Recreate from your secret store. A new `AUTH_SECRET` signs everyone out. A new `OWNER_KEY_SECRET` orphans listings (use `OWNER_KEY_PREVIOUS_SECRET`) |
| The Console / game server              | Dashboard shows "unavailable"; sign-in and guild data (Redis) still work | Restore via RedBlink backups, then re-check API keys and the adapter token                      |
| Discord application access             | No one can sign in                                                        | Regain the application in the Developer Portal; the client ID/secret in config must match it    |

## Rebuild checklist

1. Provision Redis (empty, or restored) and confirm `redis-cli ping`.
2. Install the pinned release and checksum-verify it ([release verification](../security/release-verification.md)).
3. Restore configuration from your secret store; confirm `ADMIN_DISCORD_IDS`.
4. Start; confirm `Runtime configuration validated` and the listening line.
5. Run [post-deployment checks](../deployment/deployment-checklist.md#3-postdeployment).
6. If marketplace owner keys are in question, run the re-key dry run ([migration](../deployment/migration.md)).

## Practice

Rehearse a rebuild on a throwaway server once, including a Redis restore, before you need it.
