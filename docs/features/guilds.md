# Guilds

## Purpose

Browse guilds, manage your own roster, publish a recruitment listing and talk to the dashboard administrators.

## Guild noticeboard

The My guild roster page includes a private noticeboard for freshly verified current guild members. Leaders can edit the message of the day and priorities, create or edit announcements, pin important posts and confirm removals. The daily message stays until a leader changes it; it does not reset at midnight. Announcements render as plain text, with author names and local timestamps.

Each guild keeps at most 20 announcements, with 5 pinned; titles allow 100 characters, announcement text 3,000, and the daily message and priorities 1,000 each. Inactive boards expire 90 days after their last successful update and are removed when the guild is disbanded through the dashboard. Reads do not extend retention.

Every read and save rechecks linked-character pawn/controller IDs against the current Console roster. Only role 100 can save. Failed verification hides private data, and stale edits return a conflict instead of overwriting another leader's update. Failed saves keep the draft; use Refresh noticeboard to load the latest revision before deliberately saving again. There is no automatic save retry, polling or Discord announcement delivery for this first stage.

## Operations planner

Open **My guild → Operations** (`/guild?tab=operations`) to plan spice runs, Deep Desert trips, boss runs or other guild activities. Verified leaders can create or edit future runs, set a meeting point and notes, allocate pilot/scout/escort/harvester/support slots, mark runs completed or cancelled, remove sign-ups and confirm removal of old plans. Current members can read the schedule, join a role, switch roles or withdraw before the run starts. Sign-ups show the last verified character name; members who leave the guild cannot act, and leaders can remove their old sign-ups to free slots.

Times are entered in the device's timezone, stored in UTC and displayed in each viewer's local timezone. A run must start in the future within one year and last no more than 24 hours. The schedule has Upcoming and active / Past and closed filters, with manual refresh. The server closes sign-ups and withdrawals at the start time. Changing an operation keeps existing sign-ups; tell members about changed times or meeting points yourself. Occupied roles cannot be removed or reduced below their current sign-up counts.

Each guild keeps at most 20 operations, with 50 slots per operation across five distinct roles. One freshly verified character can hold one role per operation; linking another dashboard account to the same character does not add a second reservation. Atomic revision checks protect the last role slot and prevent stale edits. Conflicts require explicit refresh; failed saves and refreshes keep the current draft, and writes never retry automatically. Views use opaque sign-up IDs and an own-signup flag, without Console player IDs.

Operations stay private to verified members. Management requires a fresh role-100 check on every request. Guild records use bounded Cluster-compatible Redis storage, are removed on dashboard disbanding, and have retention refreshed by changes and extended to cover scheduled runs plus 90 days. Reads do not extend retention. Planning does not move items, currency or characters, send Discord announcements or reminders, or synchronize an external calendar.

## Resource requests

Open **My guild → Resources** (`/guild?tab=resources`) to ask guildmates for materials and arrange deliveries. Current members can create requests with a whole quantity, unit, drop-off point, notes and priority. The requester or a freshly verified leader can edit, cancel or remove a request. Existing pledges lock its material and unit, and the requested quantity cannot fall below what is already pledged.

Suppliers can volunteer a quantity, update or withdraw an outstanding promise, and report delivery after delivering resources in game. The requester or a leader reviews the claim and confirms actual receipt, returns it to promised for correction, or releases an unconfirmed pledge. Even a leader cannot confirm their own delivery. Reported amounts do not count as received until confirmed. Once confirmed deliveries cover the requested amount, the request becomes fulfilled automatically and appears under Completed and cancelled. Confirmed receipts stay recorded; the same supplier can pledge another partial delivery while resources are still needed.

Quantities remain exact whole-number strings of up to 18 digits. The guild retains at most 20 requests, each character may keep 5 open requests, and a request retains up to 20 pledge/delivery records. One character may hold one outstanding pledge per request, including across linked dashboard accounts. Atomic UUID revision checks prevent over-pledging and stale edits. Failed saves and refreshes preserve request and pledge drafts; refresh manually before deliberately retrying, without automatic write retries. Open requests sort urgent first, then newest first.

Every read and action rechecks linked-character membership. Responses use display names, opaque pledge IDs and caller-relative ownership flags, without Console player IDs. Only the requester or leader can manage someone else's pending pledge; confirmed deliveries cannot be edited individually. Inactive guild resource records expire 90 days after the last successful change, reads do not extend retention, and dashboard disbanding removes them. This tracker records coordination only: it never transfers inventory or currency, verifies physical delivery through Console, or sends automatic announcements.

## Shared base directory

Open **My guild → Bases** (`/guild?tab=bases`) to find private guild locations. Current members can search by name, location, contact, instructions or notes, and filter by map, purpose and active/archived status. Search stays in the browser and is not placed in URLs. Listings cover Hagga Basin and Deep Desert, with headquarters, storage, crafting, staging, outpost or other purposes.

Freshly verified leaders can create and edit a name, location/grid reference, contact person, access instructions and optional notes. They can archive outdated directions, restore them after checking details, or confirm removal. Editing an archived listing keeps it archived. These are manually maintained directions: a listing does not verify base ownership, grant game permissions, publish a marketplace blueprint or import a base. Confirm current details with the listed contact before travelling.

Every read verifies current linked-character membership; each change rechecks role 100. Records expose verified editor names and timestamps, without account or Console character IDs. The directory retains at most 50 listings, with 32 KiB per record and 16 KiB mutation bodies. Atomic UUID revisions prevent stale overwrites and concurrent quota overruns. Failed saves keep drafts; failed verification hides private details while retaining the draft for a successful refresh. Refresh explicitly before retrying; writes never retry automatically. Inactive directories expire 90 days after their last successful change, reads do not extend retention, and dashboard disbanding removes the directory.

## Recruit onboarding

Open **My guild → Onboarding** (`/guild?tab=onboarding`) for the guild's welcome message, rules, useful locations and checklist. Leaders maintain up to 20 checklist items, assign a different current member as mentor (or clear an assignment), review retained progress and confirm removal of old progress records. Members mark or undo their own checklist items and explicitly acknowledge the current guild rules. These are self-reported coordination records; they never change guild ranks or game access. Mentor assignments do not send automatic messages or grant access to another recruit's progress.

Members see the guide, their own progress and mentor; only freshly verified leaders see the progress overview and assignment controls. Every read and write verifies linked-character membership by roster IDs. Progress uses a guild-specific character reference, so multiple dashboard accounts linked to the same character share a record. Names never authorize access. Departed mentors appear unavailable; leaders can remove former members' progress. Welcome/location edits preserve progress, while edited or removed checklist items lose their completion marks and changed rules require a new acknowledgment. Unchanged items retain their marks.

Onboarding keeps at most 200 progress records and accepts a verified roster of up to 500 members. The guide allows 2,000-character welcome/location text, 4,000-character rules and 200 characters per checklist item. All records share a bounded 256 KiB Redis document with atomic UUID revision checks. Concurrent changes return a conflict instead of losing progress. Failed saves and refreshes preserve guide drafts; failed refresh verification hides private information. Refresh explicitly before retrying, without automatic write retries. Inactive guild onboarding expires together 90 days after the last successful change; reads do not extend retention, and dashboard disbanding removes the document.

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
