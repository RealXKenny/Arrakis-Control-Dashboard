# Rollback

Decide quickly: **code**, **data**, or **secrets**. They roll back independently.

## Code and release

1. Pterodactyl: set `RELEASE_TAG` to the last good version (for example `v2.0.0`) and **Reinstall**. The pinned release must have its archive and
   `.sha256` published or the install refuses it by design.
   Node.js: check out or extract the previous release, `npm ci --ignore-scripts`, `npm run build`, restart.
2. Releases are never deleted or retagged by the workflow; to withdraw a bad release, publish a newer fixed version.
3. If the bad release changed required environment variables, restore the old values; production refuses to serve with missing required ones.

## Marketplace migration

```bash
npm run marketplace:rekey -- --rollback /secure/location/rekey-backup.json
```

Restores each listing, its index entry and recomputes counters. It also works after an interrupted `--apply`. Confirm with the dry run
(`npm run marketplace:rekey`) that legacy keys are back. See [migration](migration.md).

## Redis data

Restore the pre-deployment snapshot ([restore](../administration/backups.md#restore)). Sessions and data created after the snapshot are lost; members sign in again.

## Secrets

- `OWNER_KEY_SECRET` changed by mistake: restore the old value, or keep the new one and set the old as `OWNER_KEY_PREVIOUS_SECRET`, then run
  `npm run marketplace:rekey -- --apply --backup <file>` again.
- `AUTH_SECRET` changed: every stored refresh token and in-flight sign-in becomes unreadable; restore the old value to avoid forcing everyone to sign in.
- Console keys or adapter token rotated: update both sides together.

## Verify after rollback

Repeat the [post-deployment checks](deployment-checklist.md#3-postdeployment) on the rolled-back version; confirm the dry run shows the expected number
of listings to migrate and that members can manage their listings.
