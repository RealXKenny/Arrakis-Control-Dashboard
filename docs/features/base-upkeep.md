# Base upkeep (N021–N030)

`/upkeep` (Assets → Holdings → Base upkeep) gathers solo base-care tools for the bases your linked character can currently inspect. No game guild is required. Every plan is private to your dashboard account and current linked pawn/controller pair, and nothing on the page performs, schedules or confirms a game action.

## Sections

| Section    | Items            | What it does                                                                                                                                                                                                                                                                                                                    |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Care inbox | N021, N022, N023 | Combines water alerts, generator-runtime reminders, due inspections and due personal reminders for up to 20 bases in your current authorised profile. Unknown water or generator readings are listed as unknown, never as healthy.                                                                                              |
| Care inbox | N028             | Observed water-level chart per base. Samples are kept only when you open the page (at most one per base every ten minutes, seven days shown, 1,008 kept, 14-day expiry). Gaps over two hours are shaded, unknown readings marked, refills excluded from usage, and usage/threshold projections labelled as uncertain estimates. |
| Base plans | N022, N023, N026 | Per-base water alert (default 10%), generator reminder hours (default 24h) and inspection cadence. The inspection checklist covers water, power, supplies and manually checked access by default; you can add custom checks. Recording an inspection stores your results and notes with a server timestamp (last 10 kept).      |
| Base plans | N025             | Up to 12 stockpile minimums per base. **Check stockpile** reads only that base's containers your character can open and compares exact BigInt totals. Incomplete coverage can prove a target is met but never reports a shortfall; it shows **unknown** instead.                                                                |
| Base plans | N024             | Private aliases and zones (Building, Medical, Fuel, Expedition, Water, Crafting, Other) for containers you can currently open. Contents are not read and nothing is renamed in game.                                                                                                                                            |
| Reminders  | N027             | Up to 40 recurring reminders (1–365 days), optionally tied to a base. **Mark done** records the time only (last 20 kept).                                                                                                                                                                                                       |
| Blueprints | N029             | Up to 24 private revisions of your own layouts. The uploaded layout JSON is validated server-side and reduced to counts, dimensions and a 200-point footprint sample; the file itself is not stored. Revisions can be compared side by side with per-type count changes.                                                        |
| Relocation | N030             | Up to 5 plans linking a source base, destination notes, packing list (with finder links), cargo trips (with vehicle links) and remaining tasks.                                                                                                                                                                                 |

## Readings and limits

- Water and storage come from the same portal profile as Holdings (15-second shared cache per member). Generator reminders use only a reported runtime field; the portal gauge's zero default is not treated as evidence. Run-out times are estimates assuming constant consumption.
- Base-specific plans can be saved only for bases in your current authorised profile. Container labels require a fresh check that your canonical character can open that container. Plans for bases that later disappear stay private and unused until access returns, and can be removed.
- Stockpile checks share the item finder's six-searches-per-member-per-minute budget and its source, container and stack bounds. Item rows are never returned; only totals and coverage.
- Plans live in one Redis record (256 KiB) per account and linked character with UUID compare-and-set, server-owned timestamps and 90-day inactivity expiry. Stale tabs must reload; unconfirmed saves are never retried automatically.
- Upkeep requests allow 30 per member per minute (10 for container listing and blueprint uploads). Mutations are same-origin JSON, 16 KiB (2 MiB plus metadata for blueprint uploads).

## API

| Route                               | Method     | Purpose                                                                    |
| ----------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `/api/v2/upkeep`                    | GET / POST | Read the private plan record / apply one typed action with a revision.     |
| `/api/v2/upkeep/overview`           | GET        | Fresh profile readings, care inbox, observed water samples and the record. |
| `/api/v2/upkeep/stockpile?base=ID`  | GET        | Compare one base's saved minimums with current authorised observations.    |
| `/api/v2/upkeep/containers?base=ID` | GET        | List containers the linked character can open (names and IDs only).        |
| `/api/v2/upkeep/blueprints`         | POST       | Add a blueprint revision summary from an uploaded layout.                  |

All routes require a session and a fresh adapter link, return `no-store` JSON and derive the owner only from the session.
