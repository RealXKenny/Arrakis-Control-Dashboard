# Dungeon leaderboard

`/dungeons` shows the fastest completion for every dungeon and difficulty on the server, the most recent runs, and the signed-in member's own records. It is listed under **Community → Events & seasons**.

## What the page shows

- **Highlights**: how many dungeons have a record, the runs counted across the board, the fastest clear, the most run dungeon and difficulty, and the characters holding the most server records. All of it is computed in the browser from the cached records board, so it costs no extra Console request.
- **Party size filter**: the records and my records tabs can be narrowed to records set solo, as a duo, or by a group of three or more.
- **Gap to the server record**: recent runs and personal bests show a "Server record" badge when the run holds or ties the record for that dungeon and difficulty, or how far behind it is (for example `+0:12.3`). The personal tab also says how many server records the member holds.

## Data source

Only the Console's documented dungeon routes are used (both need the `players:read` key scope):

| Console route                                   | Used for                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/dungeons/leaderboard`                 | Records tab: best run per dungeon and difficulty, plus `runCount`    |
| `GET /api/dungeons/runs?page&pageSize=25&…`     | Recent runs tab, newest first, filtered by dungeon and difficulty    |
| `GET /api/dungeons/leaderboard?playerId=<pawn>` | My records tab: personal bests for the member's own linked character |

The Console stores no completion time, so runs are ordered by completion id and no dates are shown. Difficulty is the raw game integer and is shown as "Difficulty N"; the dashboard does not guess difficulty names. Dungeon names are derived from the asset id (`DA_Dgn_089_Radiation` becomes "Radiation"); the asset id stays visible as a tooltip. When the Console reports `capabilities.dungeons: false`, the page says the server does not report dungeon completions instead of showing an empty board.

## Privacy

Only character names leave the server. Controller ids and actor ids from the party rows are dropped during validation. A soft-deleted character keeps its seat as "Unknown character". Personal bests resolve the member's linked character freshly through the Discord adapter on every request; a client-supplied player id is never accepted.

## Caching and refresh

All three views use the [shared cache](../architecture/caching.md):

| Reading          | Fresh for                                     | Kept for | Key                       |
| ---------------- | --------------------------------------------- | -------- | ------------------------- |
| Records board    | `DUNGEON_LEADERBOARD_REFRESH_SECONDS` (300 s) | 7 days   | one shared key            |
| Recent runs page | same                                          | 1 day    | page, dungeon, difficulty |
| Personal bests   | same                                          | 1 day    | linked player id          |

Opening the page renders the cached board on the server, so it costs no extra Console request while the board is fresh. The browser checks back at the refresh interval only while the tab is visible and pauses while it is hidden. Filter values for recent runs must match a dungeon and difficulty already on the board, which keeps the number of cache keys bounded.

If the Console is unreachable, the last good reading stays on screen with a "Cached" badge and its original retrieval time. With no reading at all the page shows an unavailable state, never zeros.

## Limits

- `GET /api/v2/dungeons?view=board|runs` is limited to 60 requests per member per minute; `view=personal` to 10.
- Recent runs are capped at 200 pages of 25.
- A malformed upstream row rejects the whole reading so a partial board is never cached as complete.
