# Fleet tools and expeditions (N031–N040)

Solo vehicle and exploration planning. **Vehicles → Fleet tools** covers N031–N035; **Assets → Fleet → Expeditions** (`/expeditions`) covers N036–N040. Everything is read-only toward the game: no tool renames, moves, refuels, repairs, reserves or teleports anything.

## Verified fleet reading (N031, N033, N035)

`GET /api/v2/vehicles/fleet` is fetched only when the member presses **Check fleet**. The server resolves the fresh canonical pawn/controller pair (the item finder's resolver), reads the player-scoped `/api/players/{pawn}/vehicles` list and checks each of at most 20 vehicles against `/api/vehicles/{id}/permissions` for the controller's exact canonical roster entry, with three workers, a 4-second provider timeout, a 20-second overall deadline and the shared read budget. List rows, names and caller IDs never authorize a vehicle; failed or non-canonical checks are excluded and counted. Six fleet or cargo reads per member per minute, fail closed.

Each vehicle returns relationship, fuel %, lowest-component condition %, up to 24 components (`conditionPercent`, inferred-maximum flag), lifecycle state, map, region, Deep Desert sector and coordinates. Missing readings stay `null` and display as unknown; they are never treated as 0% or 100%.

- **Maintenance inbox (N031):** vehicles at or below the member's fuel and component thresholds, ordered by severity, then lowest fuel, then lowest component condition. Vehicles with unreported fuel or condition are listed as unknown rather than healthy. Thresholds are saved in the private plan.
- **Component comparison (N033):** up to four vehicles side by side per component name. Only reported readings can be flagged weakest; estimated maximums are marked.
- **Locator (N035):** last observed map, region/sector and coordinates at the time of the reading. `Travel`, `VehicleBackup` and `VehicleRecovery` records show their lifecycle state (and stored time) instead of a position, and a vehicle with no current world partition has no position. This is not live tracking.

## Private labels and cargo manifests (N032, N034)

Nicknames, up to six tags and a purpose note per vehicle are private planning labels; game records keep their names. Up to ten manifests list up to 40 items each with exact decimal-string quantities. `GET /api/v2/vehicles/cargo?vehicle=<id>` re-verifies that the vehicle is in the player's list and on the canonical roster before reading `/api/vehicles/{id}/storage`, then returns per-template BigInt totals, slot/volume capacity and a partial flag (500 slots, missing template IDs, non-integer quantities). The manifest comparison reports loaded, short or unknown; a partial or inexact reading never reports a definite shortfall.

## Bookmarks, routes and scouting journal (N036–N038)

Up to 100 bookmarks (map, world X/Y, name, note), 20 routes of 2–25 bookmarks on one map, and 60 journal entries with optional coordinates and a last-checked time. Routes may reference only bookmarks in the same record and on the same map; referenced bookmarks cannot be removed. Distances are straight-line estimates assuming Unreal centimetre units (100,000 units per kilometre) and are always labelled as planning estimates that ignore terrain, storms and sandworms. Deep Desert entries show the A–I/1–9 sector from the map's own grid.

## Deep Desert departure checklist (N039)

The page reads the Console's Coriolis fields from `/api/map/markers?map=DeepDesert&static=0` (one shared 60-second cache entry, read budget). Checks compare the reported next cycle with the planned trip length, flag a stale cycle seed, estimate the selected route, compare the selected vehicle with the member's thresholds and lifecycle, and compare a selected manifest with a fresh cargo reading. Missing sources produce **Unknown**, never **Ready**. Up to 30 personal checklist items are ticked manually; a suggested starting list is offered.

## Persistence

The plan (labels, thresholds, manifests, bookmarks, routes, journal, departure) is one versioned record at `arrakis:expedition-plan:v1:<SHA-256(account, controller, pawn)>`, private to the verified account and exact linked character like N002 pins. It is bounded to 128 KiB, retained for 90 days of inactivity and written with single-key UUID compare-and-set; conflicts return 409 and writes never retry. Corrupt or revisionless records fail closed. `GET`/`POST /api/v2/expeditions/plan` derive ownership only from the session and fresh link; POST requires same-origin JSON, a 128 KiB body and the strict schema. 30 requests per member per minute.

## Rescue request cards (N040)

Off by default. The member enters a call sign, a map with an optional saved bookmark (no live position is ever read), a place description, one or more assistance types and details, reviews the exact card and confirms publication for 1, 2 or 6 hours. Publication creates a 256-bit unlisted link `/expeditions/rescue/<id>`; the audience is signed-in dashboard members who hold the link (the same model as the privacy center), not an anonymous or searchable page. One active card per account: publishing again replaces it and atomically invalidates the old link; **End rescue request** deletes it. Ending stops future reads but cannot recall what was already seen.

Keys share `{rescue}` (`arrakis:{rescue}:v1:owner:<SHA-256(account)>`, `…:card:<SHA-256(link)>`) so Lua publish/cancel scripts stay atomic on standalone and Cluster Redis. Records are bounded to 8 KiB, expire by TTL and are rechecked against `expiresAt` on every read. Unknown, replaced, ended and expired links are indistinguishable. Owner API: `GET`/`POST /api/v2/expeditions/rescue` (`publish` with `confirmed: true` and the current link tag, or `cancel`), 20 per member per minute; member read: `GET /api/v2/expeditions/rescue/<id>`, 30 per member per minute. Audits record the action only, never content or link IDs. Card content renders as plain text.

## Limitations

- Vehicle coordinates, fuel and condition are Console observations at read time; fuel capacity and component maximums may be inferred by the Console and are marked when they are.
- Template IDs for manifests are typed by the member (the Storage item finder shows them); nothing validates them against the game catalog.
- The Coriolis time is whatever the Console reports; verify in game before a long trip.
