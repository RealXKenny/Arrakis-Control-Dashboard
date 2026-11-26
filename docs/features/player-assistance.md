# Player assistance (N077)

The `/help` board connects new players with community volunteers. Requests use six categories: getting started, base building, survival, crafting, vehicles and guilds. A request has a 3–120 character title and 10–2,000 character details. Members can keep three active requests, with at most 200 total records and three new requests/account/hour.

Open requests show only their public title, category, details, requester display name and timestamps. Assigned/closed history is visible only to the requester and assigned volunteer. Account IDs are never returned. Availability is private to its owner except for the display name attached to an accepted assignment; there is no public volunteer roster.

## Matching and lifecycle

Volunteers choose availability and matching categories, with one active assignment per volunteer. Claiming atomically rechecks the open request, category, volunteer revision and inactive slot. The requester cannot claim their own request. Two volunteers racing for one request have exactly one winner. Volunteers cannot disable availability during an active assignment.

The lifecycle is `open → assigned → in-progress → resolved → closed`. Participants can start and resolve work; the requester can cancel or close, and the volunteer can leave an assignment, which reopens it. Resolution/cancellation/unassignment releases the volunteer slot. All lifecycle mutations use UUID compare-and-set and bounded 20-action/account/minute limits. Read markers are different: they remain participant-checked but do not change the request revision or block the other participant's next action.

## Private chat and abuse reporting

Assigned participants get a private dashboard chat, not a game-chat channel. Only the requester and volunteer can read or send messages while work is active. Chats retain at most 50 messages of 1,000 characters, with 30 sends/account/minute and explicit reads/refreshes rather than polling. Responses omit owner IDs. Closed chats remain visible only to participants.

Any member who can see a request can submit one 10–1,000 character abuse report. The public projection shows only that a report exists; reporter identity and reason remain server-side for the separate moderator workflow. Assistance records and messages have 90-day inactivity retention, refreshed by reads/writes. Redis keys share the `{assistance}` Cluster slot.

The Assistance inbox category alerts only the requester/volunteer for active assignments and stops after resolution. Existing notification preferences apply, with backward-compatible enabled/zero-cooldown defaults. No game permission, inventory, currency or public chat mutation is involved.

## API and verification

`GET/POST /api/v2/assistance`, `/volunteer`, `/[requestId]`, and `/[requestId]/messages` enforce verified sessions, session ownership/participants, same-origin bounded JSON writes, no-store responses and fail-closed rate limits. Unit/API tests cover projections, origin checks and privacy. Browser coverage exercises creation, availability, claiming, two-way private chat, active/resolved inbox behavior, abuse reporting, closure, cross-member privacy, 390px layout and axe accessibility. `tests/integration/redis-assistance.test.ts` covers real standalone/Cluster lifecycle, stale read markers, private chat and two-claimer races with a disposable target.
