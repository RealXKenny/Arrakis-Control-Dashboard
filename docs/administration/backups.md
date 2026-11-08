# Backups and restore

Two independent systems hold data. Back up both.

| System                      | Holds                                                                                    | Backed up by                                               |
| --------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Redis (dashboard)           | Sessions, accounts, guild data, marketplace, audit copy                                   | Your Redis tooling (below)                                  |
| RedBlink Dune Docker        | Game database, `.env`, `runtime/generated/`, `runtime/secrets/`                           | Upstream database and **system backups**                    |
| Dashboard configuration     | `.env` / panel variables                                                                  | You: keep them in a secret store, not in Git                |

The dashboard has no backup feature of its own for Redis, and it does not drive the RedBlink backups beyond the Console operations
available in the [administrator panel](../features/administrator-panel.md) (backup create/restore/delete operations are high-risk and
need a recent sign-in).

## Redis

- Enable persistence on the server (AOF and/or RDB) and copy snapshots off the host regularly. These are standard Redis procedures
  (`redis-cli --rdb`, copying the RDB/AOF files, or your platform's snapshot tool).
- On a Cluster, back up **every master**; the data is spread across shards.
- Before any release that changes data layout, before running `npm run redis:rekey` or `npm run marketplace:rekey`, and before
  changing secrets, take a fresh snapshot and keep it until the change is accepted.
- Encrypt backups and restrict access: they contain session records, account password hashes and guild data.

### Restore

1. Stop the dashboard.
2. Restore the snapshot into an empty Redis (or the same instance after stopping writes) with your platform's procedure.
3. Start the dashboard. Members created after the snapshot sign in again; guild applications and listings after it are lost.
4. Verify with the [post-deployment checks](../deployment/deployment-checklist.md#3-postdeployment).

## Marketplace re-key backup

`npm run marketplace:rekey -- --apply --backup <file>` writes the listing documents it is about to change **before** the first write.
Keep that file private (it holds listing data) and use `--rollback <file>` to undo ([migration](../deployment/migration.md)). It does not replace a Redis backup.

## RedBlink (upstream)

RedBlink documents database backups, **encrypted system backups** (database plus `.env`, `runtime/generated/`, `runtime/secrets/`; one
GPG AES-256 archive with no recovery without its passphrase) and base backups from the in-game pick-up mechanic. Restores to a different
Battlegroup ID require choosing *Adopt Backup ID* or *Keep Current ID*. Follow the upstream guide
([database-backups](https://github.com/Red-Blink/dune-awakening-selfhost-docker/blob/main/docs/console/database-backups.md)). After restoring
a Console, re-create or re-check the API keys and adapter token the dashboard uses.

## Restore tests

Test restores on a separate Redis and a staging dashboard at least once before you depend on a backup.
