# Guilds

## Purpose

Browse guilds, manage your own roster, publish a recruitment listing and talk to the dashboard administrators.

## Guild noticeboard

The My guild roster page includes a private noticeboard for freshly verified current guild members. Leaders can edit the message of the day and priorities, create or edit announcements, pin important posts and confirm removals. The daily message stays until a leader changes it; it does not reset at midnight. Announcements render as plain text, with author names and local timestamps.

Each guild keeps at most 20 announcements, with 5 pinned; titles allow 100 characters, announcement text 3,000, and the daily message and priorities 1,000 each. Inactive boards expire 90 days after their last successful update and are removed when the guild is disbanded through the dashboard. Reads do not extend retention.

Every read and save rechecks linked-character pawn/controller IDs against the current Console roster. Only role 100 can save. Failed verification hides private data, and stale edits return a conflict instead of overwriting another leader's update. Failed saves keep the draft; use Refresh noticeboard to load the latest revision before deliberately saving again. There is no automatic save retry, polling or Discord announcement delivery for this first stage.

## Pages

| Page            | Route     | Who                                                                            |
| --------------- | --------- | ------------------------------------------------------------------------------ |
| Guild directory | `/guilds` | Everyone signed in: published recruitment listings and your application status |
| My guild        | `/guild`  | Your roster; guild leaders also get settings, application inbox, support chat  |

## Roles and permissions

Management requires a **freshly verified linked-character leader**: the Console's roster must show your linked character (pawn or
controller ID) with role `100`. Cached names or IDs never authorize edits; every leader action re-reads the roster. Console writes
are never retried.

| Rank    | Console role | Notes                                                                                               |
| ------- | ------------ | --------------------------------------------------------------------------------------------------- |
| Leader  | 100          | Cannot be removed or demoted from the dashboard                                                     |
| Officer | 50           | Can be demoted; promoting an Officer transfers leadership and requires typing `TRANSFER LEADERSHIP` |
| Member  | 1 to 49      | `add member` accepts roles 1 to 99                                                                  |

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
