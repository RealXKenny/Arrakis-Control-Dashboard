# Market planner

`/market/planner` is a private shopping and price-watch workspace for one member (N041–N050). Open it from the **Market planner** button on `/market`, or from the **Plan** link on any market tile, which prefills the item and grade.

The planner only reads data. It never places, cancels or reserves exchange orders, and it never moves, reserves or adjusts Solaris or items.

## Features

| Item | What it does                                                                                                                                                                                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N041 | Watchlist of up to 20 items, each for one grade or any grade.                                                                                                                                                                                                                                  |
| N042 | Optional low and high thresholds per watch (inclusive, whole Solaris) with a 15-minute, 1-hour, 4-hour or 1-day cooldown. Alerts are evaluated when the member checks listings and appear in the planner. Unknown or incomplete ladders never alert. The inbox does not read these alerts yet. |
| N043 | Observed lowest-ask chart per watch, with a table view. Points exist only when a member's planner read the ladder, at most one per item and grade every 10 minutes. Gaps break the line and are never interpolated.                                                                            |
| N044 | Completed-order activity per hour (24 hours) or per day (7 or 30 days) from `GET /api/exchange/transactions`, with Console totals and coverage. Only aggregate buckets reach the browser.                                                                                                      |
| N045 | Shopping basket of up to 20 lines. Estimates walk the current ladder cheapest first and show listed cost, units available and shortfalls.                                                                                                                                                      |
| N046 | Up to five project shopping lists (12 materials each). **Compare with storage** counts what authorized storage holds (all grades) through the item finder, then estimates the cost of the rest.                                                                                                |
| N047 | Your sales: completed player orders attributed only when the row carries an explicit seller ID equal to the freshly verified linked pawn or controller ID. Names never count.                                                                                                                  |
| N048 | Basket estimate compared with the read-only Solaris balance (`GET /api/players/{id}/currency`) and an optional personal budget.                                                                                                                                                                |
| N049 | Up to 10 saved market filters (search, sort, show) and the last 10 market searches, which can be cleared.                                                                                                                                                                                      |
| N050 | Player and broker lowest asks and stock per watch. `player` is a player listing; `bot`, `npc` and `broker` are broker listings; anything else is counted as unclassified.                                                                                                                      |

## Honest readings

- Prices, stock, costs and balances are decimal strings compared with BigInt.
- A truncated ladder (over 500 orders) or one with unreadable orders gives no estimate and an unknown alert state. A missing estimate or unfilled units make the basket total a lower bound, so the planner never claims it is affordable.
- Partial storage coverage marks owned counts as "or more" and amounts to buy as "at most".
- Completed-order history exists only on Console releases that record it, from that release forward. A 404, 405 or 501 is reported as unsupported, 401/403 as a key permission problem, and other failures as unavailable. At most five pages of 100 orders are read; larger ranges are marked truncated. Rows without a usable timestamp are excluded and counted.
- When completed orders carry no seller ID field, sales are reported as not attributable instead of guessed.

## Privacy and limits

- Planner records, alert cooldowns and search history are keyed by a SHA-256 hash of the verified session account ID. They expire after 90 days of inactivity.
- Saves use same-origin JSON, a 16 KiB limit, strict schemas and UUID compare-and-set. Conflicts are reported and never retried automatically.
- Observed price series are shared exchange data keyed by item and grade only. Each keeps at most 720 points and expires 30 days after its last observation. Empty ladders are not recorded, so unknown template IDs cannot create series.
- Seller IDs and names are dropped on the server. Ladder readings return only price, stock and classification; activity returns only buckets.
- Per-member limits per minute: 30 planner reads/writes, 10 listing checks, 30 price-history reads, 6 activity or sales reads. Project comparisons share the item finder's 6 searches per minute. Listing checks and order reads also spend the shared read budget. Ladder reads are cached for 15 seconds and order reads for 60 seconds, with at most three ladder reads in flight per request.

## API

All routes need a session and return `Cache-Control: no-store`.

| Route                                  | Method    | Purpose                                         |
| -------------------------------------- | --------- | ----------------------------------------------- |
| `/api/v2/market/planner`               | GET, POST | Read or save the planner record (and history)   |
| `/api/v2/market/planner/readings`      | GET       | Ladders, alerts, estimates and budget           |
| `/api/v2/market/planner/prices`        | GET       | Observed price points for `templateId`, `grade` |
| `/api/v2/market/planner/projects/{id}` | GET       | Project owned-versus-needed comparison          |
| `/api/v2/market/planner/searches`      | DELETE    | Clear recent searches                           |
| `/api/v2/market/activity?hours=&q=`    | GET       | Completed-order buckets (24, 168 or 720 hours)  |
| `/api/v2/market/sales?hours=`          | GET       | Ownership-verified sales                        |

## Live verification still needed

The fixture Console has no transaction history, so N044 and N047 were verified against synthetic rows. The transaction field names (`created_at`/`completed_at`, `quantity`, `total_price`/`price`, `seller_id`) are read defensively; confirm them against the installed Console before relying on sales attribution.
