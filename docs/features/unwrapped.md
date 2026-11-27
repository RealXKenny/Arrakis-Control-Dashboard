# Unwrapped

`/unwrapped` is the year in review: a short run of full-size cards that look back on the current year, one set for the whole server and one for the signed-in member. It is listed under **Community → Events & seasons**, after the Solaris leaderboard.

Members move through the cards by swiping, with the arrow keys (Home and End jump to the first and last card) or with the Previous and Next buttons. Nothing plays by itself, and the card animation is off under `prefers-reduced-motion`.

## What the cards show

Unwrapped only uses readings the dashboard already keeps. A card whose source is missing, unsupported or unavailable is left out; nothing is estimated or shown as zero in its place.

**The server**

| Card            | Source                                                                          | Notes                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Releases        | The published changelogs in `docs/changelog/bot.md` and `dashboard.md`          | Only releases dated in the current year. New features (`New Features`/`Added`), improvements (`Improvements`/`Changed`) and fixes.        |
| Biggest release | Same                                                                            | The release with the most new features and the names of its first three.                                                                  |
| Dungeons        | The [dungeon leaderboard](dungeon-leaderboard.md) records board                 | Runs counted, dungeons and records, most run dungeon. All-time: the Console does not store when a run happened, and the card says so.     |
| Fastest clear   | Same                                                                            | The fastest record, its party and the characters holding the most records.                                                                |
| Solaris         | The [Solaris leaderboard](solaris-leaderboard.md) board, only if already cached | Solaris held now, the wealthiest character and the top ten's share. Balances right now, not earnings over the year, and the card says so. |
| Roadmap         | The [public roadmap](roadmap.md)                                                | Items released, in the works (in development or testing) and planned.                                                                     |

**You**

| Card          | Source                                                       | Notes                                                                                                                                           |
| ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Dungeons      | Personal bests for the linked character                      | Personal bests, dungeons cleared, server records held (a personal best that holds or ties the record) and the fastest clear.                    |
| Solaris       | The cached Solaris board                                     | Rank and balance right now.                                                                                                                     |
| Your progress | The [progression journal](progression.md), if tracking is on | Level, experience and journey steps between the first and last observations recorded this year. One observation is not a change and is skipped. |

A member without a linked character gets one card that points to the Character page. A member whose journal is not tracking gets a card that points to Progression, so next year's Unwrapped can show their progress.

The year is the current UTC year. Casino rounds are not part of Unwrapped.

## Privacy

Only character names reach the browser. The personal recap resolves the member's linked character freshly through the Discord adapter on every request and reads only that character's records and the member's own journal; a client-supplied player or character id is never accepted.

## Load

Unwrapped adds no new upstream reads or cache families. The server recap uses the same shared cached readings as the dungeon leaderboard and the roadmap, and only peeks at the Solaris board, so opening Unwrapped never starts a Solaris crawl. Each source has eight seconds before its cards are left out. The personal recap is only requested once the member opens **You**.

## Limits

- `GET /api/v2/unwrapped?view=server` is limited to 30 requests per member per minute; `view=personal` to 10.
- An unreachable adapter returns an unavailable state for the personal recap, never an empty year.
