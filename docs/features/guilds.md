# Guilds

## Purpose

Browse guilds, manage your own roster, publish a recruitment listing and talk to the dashboard administrators.

## Pages

| Page            | Route     | Who                                                                                    |
| --------------- | --------- | -------------------------------------------------------------------------------------- |
| Guild directory | `/guilds` | Everyone signed in: published recruitment listings and your application status          |
| My guild        | `/guild`  | Your roster; guild leaders also get settings, application inbox, support chat           |

## Roles and permissions

Management requires a **freshly verified linked-character leader**: the Console's roster must show your linked character (pawn or
controller ID) with role `100`. Cached names or IDs never authorize edits; every leader action re-reads the roster. Console writes
are never retried.

| Rank            | Console role | Notes                                                                               |
| --------------- | ------------ | ----------------------------------------------------------------------------------- |
| Leader          | 100          | Cannot be removed or demoted from the dashboard                                      |
| Officer         | 50           | Can be demoted; promoting an Officer transfers leadership and requires typing `TRANSFER LEADERSHIP` |
| Member          | 1 to 49      | `add member` accepts roles 1 to 99                                                   |

## Leader actions (`/guild`)

- **Add member** by player ID, **promote / demote**, **remove**, with the member's expected rank checked so stale screens cannot
  change the wrong person (`GUILD_MEMBER_CHANGED`).
- **Disband guild** requires typing `DISBAND GUILD`, deletes the Console guild and all of the guild's dashboard data (listing,
  logo, applications, chats, support thread) together.
- **Settings:** recruitment listing text, contact, published flag, application questions, logo ([recruitment](guild-recruitment.md)).
  The public guild name always comes from the Console's record for the guild ID; leaders cannot publish a different name.
- **Support:** a private conversation between the leader and the dashboard administrators (100 messages of 1000 characters, 90 days).

All guild changes are audited (`guild.add`, `guild.remove`, `guild.promote`, …, `guild.settings_updated`).

## Limitations

Guild data lives in Redis under one hash tag (`{guilds}`); in Cluster mode it sits on one shard. Rank changes may need the player to
log in again to take effect in-game (the Console reports `relogRequired`).

## Troubleshooting

`GUILD_LEADER_REQUIRED` (403): your linked character is not the leader, or the Console is unreachable
(`PLAYER_VERIFICATION_UNAVAILABLE`, 503). Check the character link and key scopes.

## Related

[Recruitment](guild-recruitment.md) · [API: guilds](../api/guilds.md) · [Notifications](notifications.md)
