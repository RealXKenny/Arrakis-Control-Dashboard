# Session management

How to end sessions as an operator. How sessions work: [Sessions](../features/sessions.md).

| Goal                                   | Do this                                                                                     | Effect                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| End your own sessions everywhere       | `DELETE /api/v2/admin/sessions` as an administrator (sign-in within the high-risk window)   | All your sessions end immediately; sign in again    |
| End one member's access                | Remove their Discord role                                                                   | Session ends at the next re-check (≤ 30 minutes)    |
| Block an administrator                 | Remove from `ADMIN_DISCORD_IDS`, restart                                                    | 403 on admin APIs immediately                        |
| Invalidate everyone                    | Change `AUTH_SECRET` (refresh tokens become unreadable) **or** delete the `arrakis:session:*` keys in Redis | Everyone signs in again                              |
| Invalidate Redis sessions only         | `redis-cli --scan --pattern 'arrakis:session:*'` then delete in batches (`UNLINK`)             | Everyone signs in again; accounts and data untouched |

Notes:

- Sign-out is POST-only. Leaving a tab open does not extend a session beyond its 30 days.
- A session left open by someone who then loses the role is ended by the 30-minute re-check even if their cookie is stolen.
- Changing `AUTH_SECRET` also breaks Auth.js state and sealed refresh tokens; plan it like an incident, not routine maintenance.
- Rotating `OWNER_KEY_SECRET` does not affect sessions but orphans marketplace listings unless you migrate ([migration](../deployment/migration.md)).
- On a Redis Cluster, `SCAN` only sees one node: repeat the scan against every master.

See [incident response](../security/incident-response.md) for a stolen-cookie playbook.
