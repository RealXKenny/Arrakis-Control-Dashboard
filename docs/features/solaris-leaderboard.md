# Solaris leaderboard

`/solaris` ranks the characters on the server by the Solaris they hold, and shows the signed-in member where their own linked character stands. It is listed under **Community → Events & seasons**, next to the dungeon leaderboard.

## What the page shows

- **Highlights**: characters ranked, the Solaris they hold together (with the share held by the top ten), the wealthiest character and the median balance. All of it is computed in the browser from the cached board, so it costs no extra Console request.
- **Your standing**: the rank and balance of the member's own linked character, also highlighted in the table.
- **Ranking**: rank, character, exact balance and share of the total, 25 per page, with a name search. Equal balances share a rank (1, 2, 2, 4).

## Data source

The Console has no wealth ranking of its own, so one refresh reads the documented player routes (both need the `players:read` key scope):

| Console route                                   | Used for                                                   |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/players?status=all&page&pageSize=100` | The character directory, up to 20 pages (2,000 characters) |
| `GET /api/players/{id}/solaris-coin`            | Each character's Solaris (`total`), 8 at a time            |

This is the same Solaris figure the bot's `/leaderboard` command and the Character page show. Balances are kept as exact whole-number strings (the Console stores BIGINT), so sorting and sums never lose digits.

## Privacy

Only character names, ranks and balances reach the browser. Player ids stay in the server's cached reading, where they are used only to find the member's own entry. The member's linked character is resolved freshly through the Discord adapter on every personal request; a client-supplied player id is never accepted.

## Caching and refresh

The board is one [shared cache](../architecture/caching.md) reading (`solaris-board`), fresh for 10 minutes and kept for 7 days. A refresh costs one request per character, so it is coordinated across every process and replica and never runs per viewer. Opening the page renders only the cached board and never starts a refresh itself; with no reading yet the browser asks the API, which runs the single coordinated refresh. The browser checks back every 10 minutes while the tab is visible.

If the Console is unreachable, the last good reading stays on screen with a "Cached" badge and its original retrieval time. With no reading at all the page shows an unavailable state, never zeros.

## Limits

- `GET /api/v2/solaris?view=board` is limited to 60 requests per member per minute; `view=personal` to 10.
- Balances that cannot be read are left out and counted on the page, never shown as zero. When more than a quarter of the balances fail, the refresh is rejected and the last good board stays.
- A malformed player directory or stored reading rejects the whole refresh.
- Servers with more than 2,000 characters rank the first 2,000 and say so.
