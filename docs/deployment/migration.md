# Migrations

The dashboard has no schema migrations. Two operator tools change stored Redis data.

## `npm run redis:rekey` — hash-tag key names

Renames old key names to the hash-tagged names used today (`arrakis:{guilds}:…`, `{bm}`, `{solido:<owner>}`) so multi-key scripts are Cluster-safe.
Run it **before** moving to Redis Cluster, against the original single node with `REDIS_CLUSTER_NODES` unset:

1. `npm run redis:rekey` (dry run: counts what will move).
2. `npm run redis:rekey -- --apply`.
3. Start the release that uses the new key names.
4. Only then copy the data to the cluster (`RENAME` cannot cross slots) and set `REDIS_CLUSTER_NODES`.

It exits with status 2 and lists conflicts (an old key whose new name exists). Sessions, rate limits and caches are single-key and untouched.

## `npm run marketplace:rekey` — owner keys

Marketplace ownership uses an HMAC of the member's Discord ID (`OWNER_KEY_SECRET`, or derived from `AUTH_SECRET`). Listings published before HMAC keys used a
guessable SHA-256 key. Both generations are accepted until you migrate.

```bash
npm run marketplace:rekey                                           # dry run: counts only, writes nothing
npm run marketplace:rekey -- --apply --backup /secure/rekey.json    # migrate; the backup is written BEFORE any change
npm run marketplace:rekey                                           # should report 0 to migrate
npm run marketplace:rekey -- --rollback /secure/rekey.json          # undo, even an interrupted apply
```

| Property    | Behaviour (covered by real-Redis tests on standalone Redis 7 and a Cluster)                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Environment | `REDIS_URL` (or `REDIS_CLUSTER_NODES`), `OWNER_KEY_SECRET` (or `AUTH_SECRET`), optional `OWNER_KEY_PREVIOUS_SECRET`; loads `.env` from the working directory |
| Online      | Safe while the dashboard runs; it accepts both key generations                                                                                               |
| Resumable   | The listing's owner record changes last; counters are recomputed from stored data; safe to repeat or resume                                                  |
| Ownership   | Preserved; listings whose owner has no known account are left unchanged and reported                                                                         |
| Backup      | Contains listing documents: treat as sensitive; store outside the repository                                                                                 |
| Dry run     | Never writes                                                                                                                                                 |

### Rotating `OWNER_KEY_SECRET`

Changing the secret orphans migrated listings until they are re-keyed. Put the **old** value in `OWNER_KEY_PREVIOUS_SECRET`, set the new `OWNER_KEY_SECRET`,
and run the apply command again. Remove `OWNER_KEY_PREVIOUS_SECRET` afterwards.

### Production procedure (needs owner approval)

1. Take a Redis backup ([backups](../administration/backups.md)).
2. Confirm the final `OWNER_KEY_SECRET` is set.
3. Dry run and review counts. 4. Apply with `--backup` to a private location. 5. Dry run again: `0 to migrate`.
4. Verify in the dashboard that a member can see, update and delete their own listing and that quota counters are right.
5. Keep the backup until the change is accepted. Never run migrations against production data without a snapshot.
