# Solaris leaderboard

`/solaris` ranks the characters on the server by the Solaris they hold, runs a weekly race for the most Solaris earned, and pays weekly prizes. It is listed under **Community → Events & seasons**, next to the dungeon leaderboard.

## Wealthiest tab

- **Highlights**: characters ranked, the Solaris they hold together (with the share held by the top ten), the wealthiest character and the median balance. All of it is computed in the browser from the cached board.
- **Your standing**: the rank, total, banked and carried Solaris of the member's own linked character, also highlighted in the table, plus any weekly prize waiting to be collected.
- **Ranking**: rank, character, bank, coins, total and share of all Solaris, 25 per page, with a name search. Equal totals share a rank (1, 2, 2, 4).

A character's total is its **banked Solari Credit** (what the Character page shows as "Personal reserves") plus the **Solaris coins** it carries.

## Weekly leaderboard and prizes

The **This week** tab ranks characters by how much their total grew since the week started. Weeks run from Monday 00:00 UTC to the next Monday. Everything that adds Solaris counts (selling, contracts, trading, casino winnings moved back into the game) and spending lowers the gain. A character first seen during the week starts from its first reading. A prize paid during the week is subtracted, so a prize never counts as the next week's gain.

The `solaris-weekly` background worker does all of this automatically, every minute:

1. It reads the shared Solaris board, which also keeps the board fresh when nobody has the page open.
2. It records the reading in the week it was retrieved in (each character's starting total is kept for the week).
3. Fifteen minutes after a week ends, it closes the week and fixes the winners and their prizes. Closing never contacts the game.

Prizes are set with `SOLARIS_WEEKLY_PRIZES`, one whole amount per place, for example `500000,250000,100000` for the top three (up to ten places). Empty turns prizes off; the weekly ranking and last week's winners are still shown. The amounts in force when a week closes are the ones that week pays.

A winner collects the prize on the page with **Collect prize**, for up to eight weeks. Payment uses the same safeguards as casino transfers:

- the recipient is the member's own linked character, checked freshly, never a value from the request;
- the character must be **Offline**, because the Console writes the Solaris to the database and a live session could overwrite it;
- the balance is read first, a durable "sending" marker is written before the Console is called, and the payment counts only when the Console's reply confirms the exact new balance;
- a payment the Console refused can be collected again; a payment that could not be confirmed is **never resent** and is shown as waiting for an administrator (audit events `solaris.prize_paid`, `solaris.prize_rejected` and `solaris.prize_uncertain`).

Prize payment needs `DUNE_API_KEY` with write access to players and an HTTPS (or loopback) `DUNE_API_URL`, like season reward delivery.

## Data source

The Console has no wealth ranking of its own, so one refresh reads the documented player routes (`players:read`):

| Console route                                   | Used for                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/players?status=all&page&pageSize=100` | The character directory (one row per character, id in `actor_id`), 20 pages |
| `GET /api/players/{id}/currency`                | Banked Solari Credit (the row labelled "Solari Credit", or currency 0)      |
| `GET /api/players/{id}/solaris-coin`            | Solaris coins in the character's inventories (`total`)                      |
| `POST /api/players/{id}/add-currency`           | Only when a winner collects a weekly prize (`players` write access)         |

Characters are read 8 at a time. Balances are kept as exact whole-number strings (the Console stores BIGINT), so sorting and sums never lose digits.

## Privacy

Only character names, ranks and balances reach the browser. Player ids stay in the server's cached reading and the weekly records, where they are used only to find the member's own entry and prizes.

## Caching and refresh

The board is one [shared cache](../architecture/caching.md) reading (`solaris-board`), fresh for 10 minutes and kept for 7 days. A refresh costs two requests per character, so it is coordinated across every process and replica and never runs per viewer. Opening the page renders the cached board without waiting; a stale board starts one background refresh, and the page checks back every minute until the new reading lands. Weekly records are kept in Redis for eight weeks.

If the Console is unreachable, the last good reading stays on screen with a "Cached" badge and its original retrieval time. With no reading at all the page shows an unavailable state, never zeros.

## Limits

- `GET /api/v2/solaris?view=board|weekly` is limited to 60 requests per member per minute, `view=personal` to 10, and prize collection (`POST`) to 5.
- Balances that cannot be read are left out and counted on the page, never shown as zero. When more than a quarter fail, the refresh is rejected and the last good board stays.
- A player directory whose rows carry no usable character id is rejected instead of being cached as an empty board.
- Servers with more than 2,000 characters rank the first 2,000 and say so.
