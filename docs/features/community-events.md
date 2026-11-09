# Community events

Signed-in members open **More → Community events** (`/events`) for announcements, competitions, schedules, prizes, entry instructions and rules. The link remains inside More at every viewport size. Filters separate upcoming events, open entries or judging, and past events. Scheduled timestamps use the viewer’s timezone; unset dates display “Schedule to be announced”.

## First competition

The first read initializes one published **Base Building Competition** announcement, with **500,000 Solaris coins** and **a couple of new in-game items**. Dates, item names, entry instructions and judging criteria remain to be announced. Nothing here grants currency or items; organizers arrange the prizes.

Initialization is atomic and runs once per Redis store. Editing or deleting this announcement is respected: the seed marker prevents it from returning after deletion. Clearing or replacing the store also clears that marker, so preserve the key in Redis backups.

## Administrator workflow

Open **Administration → Players & community → Community events**, or `/admin?tab=events`.

1. Choose **New event** and enter a title, short description and full description.
2. Set an optional Solaris prize, other prizes, entry instructions and rules.
3. Optionally select start and end times in your local timezone. An end time must follow the start time when both are provided.
4. Choose the event’s status and whether to feature it. Status changes are manual; passing a scheduled date does not change it automatically.
5. Save as a **Draft** to keep it private, or choose **Published** to make it visible to all signed-in members.
6. Select an existing event to edit it. Deletion requires confirmation. Members see changes on their next page load or refresh.

The editor preserves unsaved details on a failed save and does not retry uncertain writes automatically. Each new draft uses one stable ID so a repeated request cannot create a second copy. Conflicting edits return a conflict rather than overwriting newer work; reload the page and open the latest record before editing again.

## Storage and limits

- Redis is the persistent store; no additional service or environment variables are required.
- `arrakis:{community-events}:records` is a single hash holding up to 50 events and a one-time seed marker. Its hash tag works on standalone Redis and Redis Cluster.
- Atomic Lua writes enforce the count limit and expected revision. Event records do not expire automatically.
- Titles allow 120 characters; summaries 300; descriptions and rules 4,000 each; participation instructions 2,000; and other-prize details 500. Mutation bodies are bounded to 24 KiB.
- Solaris amounts are whole numbers from zero to one trillion, for display only. They never enter the Console currency APIs or casino wallets.

## Access and safety

Every member page and read API requires a session. Only published events leave the member read path, regardless of query parameters. The admin page and APIs independently verify the configured administrator ID, guild, role and current session. Writes require the normal high-risk administrator sign-in window, same-origin checks, bounded bodies and administrator rate limits; changes are audited without recording event bodies.

All event content is rendered as text. There are no arbitrary HTML embeds, image URLs, payouts or inventory grants. Redis outages show an unavailable state rather than an unsaved, invented announcement.

## Discord announcements

Set `DISCORD_BOT_TOKEN` and `COMMUNITY_EVENTS_CHANNEL_ID` to reuse the main bot. Publishing automatically posts a Components V2 container with the title, prize pool, schedule, entry instructions, and a dashboard link. Later saves update the same post. Drafts remain private; unpublishing replaces an existing post with a generic withdrawn notice.

A background scan starts with the dashboard and retries known failures once per minute without overlapping runs. The editor distinguishes confirmed announcements from pending or unknown outcomes. An uncertain first creation is never automatically resent. Announcement state and temporary locks use Redis; see [Discord announcements](../integrations/webhooks.md) for permissions, retention, migration, and recovery limits. No separate bot process is required.

## APIs and verification

- `GET /api/v2/events`: published events for members.
- `GET /api/v2/admin/events`: all events, including drafts, for administrators.
- `POST /api/v2/admin/events`: create with a browser-generated UUID and revision zero.
- `PATCH /api/v2/admin/events`: update by event ID and current revision.
- `DELETE /api/v2/admin/events`: delete by event ID and current revision.

Unit and API tests cover validation, privileges, publication boundaries and conflict handling. Browser tests exercise the member page and the create/draft/publish/edit/delete workflow through the real API handlers with an isolated Redis protocol fixture. `tests/integration/redis-events.test.ts` exercises the Lua scripts against an explicitly configured disposable loopback Redis; use the existing `npm run test:integration` setup, never production storage.
