# Community calendar

Signed-in members can open the calendar from Community. It combines published events with start times, the current linked character's own guild-operation signups, and active countdowns from the Console restart queue. Agenda, week and month views use the viewer's local timezone and can be filtered by category. An event without a start time remains on the Community events page and is counted as unscheduled rather than placed on a guessed date.

Guild commitments require a fresh linked-character and roster membership check on every navigation. A failed check hides those commitments and reports that they could not be verified. The calendar does not send signups, expose signup rosters, store snapshots or grant game permissions. Events, operations and restart data are read independently; a failed source is shown explicitly. The active queue is a snapshot and a page reload is needed to see a reschedule or cancellation. Daily and IP-change restart schedules are not represented by the queue.

Published event records do not provide a confirmed-versus-tentative flag, so the calendar labels their state as unspecified rather than guessing. Items are ordered by start time and exact source-scoped identities are deduplicated; the calendar does not guess that differently identified records represent the same activity. Broader schedule sources and notification integration remain unfinished; this page is not a complete implementation of N074.

Browser verification covers authenticated access, populated and unavailable sources, another member's inability to see a personal operation, local-time rendering, keyboard controls, category filters, 320–1920px layouts and automated accessibility checks.
