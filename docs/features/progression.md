# Progression planner (N011–N020)

Open **Personal → Progression** (`/progression`). The planner keeps private goals, plans and notes for your dashboard account **and the exact linked character** that the Discord adapter reports. Linking a different character opens a separate, empty planner; the old one is never applied to the new character. Game readings are read-only observations from the same session-owned profile the Character page uses. Nothing in the planner moves items or currency, grants progress or performs a game action.

## Sections

| Item | Where                   | What it does                                                                                                                                                                                                                         |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N011 | Goals, portal           | Goal board for level, faction reputation, specialization level, journey objective, Solari savings and custom milestones. Up to 8 goals can be pinned; pinned goals appear on `/portal` with their current state.                     |
| N012 | Research                | Research wishlist split into **Next to pursue** (by priority) and **Unlocked (self-reported)**. The Console does not report research, so every status is the member's own record.                                                    |
| N013 | Skill builds            | Up to 10 saved builds with planned specialization levels, compared with the levels the Console currently reports, plus unspent skill points. Unreported tracks stay **unknown**.                                                     |
| N014 | Research                | Recipe-unlock checklist ticked by the member. A held schematic (inventory type 30) with exactly the same name is shown as an observation only, never as proof the recipe is unlocked.                                                |
| N015 | Journey                 | Up to 20 pinned journey objectives with notes; completion comes from the Console journey reading. A next-session checklist (30 items) records intentions only.                                                                       |
| N016 | Goals → Faction targets | Reputation targets with a bounded history (last 12 journal observations). Missing readings stay **unknown**; earlier values are never inferred.                                                                                      |
| N017 | Goals → Solari savings  | Savings targets compared exactly (decimal strings, `BigInt`) with the read-only Solari credit or pocket Solari balance. Currency is never moved, reserved or spent.                                                                  |
| N018 | Journal                 | Opt-in tracking. Changes are shown only between observations recorded after tracking starts; the oldest kept observation is the baseline and nothing before it is claimed.                                                           |
| N019 | Notebook                | Up to 40 private notes (4,000 characters, 5 tags, 5 links). Links must be dashboard paths such as `/holdings?view=owned`; external URLs are rejected. A saved link never grants access; the destination rechecks permissions.        |
| N020 | Briefing (default tab)  | Return briefing: observed changes since the last recorded observation (including bases and vehicles added or no longer listed), outstanding goals, open checklist items, the next seven days of calendar commitments and open tasks. |

Goal completion is derived from the current reading for every kind except custom milestones, which the member marks done. When a reading is missing or a faction, specialization or objective is not reported, the goal shows **Unknown** rather than zero or complete.

## Journal recording

Tracking is off until the member chooses **Start tracking**. While it is on, opening the planner records at most one observation every six hours, and **Record now** records one at most every 15 minutes. Each observation holds level, experience, both Solari balances, up to 24 factions and specializations, completed journey counts per group and up to 25 base and vehicle names. The journal keeps the latest 40 observations. Observations are recorded only from a successful profile reading for the same character; failed readings record nothing. A full 25-row asset list never reports an asset as removed. **Clear journal** keeps a fresh revision so a stale tab cannot restore cleared observations.

## Storage and security

- Redis keys `arrakis:progression-planner:v1:<SHA-256(account, character)>` (256 KiB) and `arrakis:progression-journal:v1:<…>` (192 KiB), each with a UUID revision, single-key Lua compare-and-set (standalone and Cluster) and 90-day inactivity expiry refreshed by reads.
- Corrupt, oversized or unknown-version records fail closed instead of being reset. Concurrent edits have one winner; the loser gets a 409 and keeps the draft. Writes never retry automatically.
- `GET /api/v2/progression` and `POST /api/v2/progression` (strict actions `save-goal`, `save-research`, `save-build`, `save-recipe`, `save-journey-pin`, `save-checklist`, `save-note`, `delete`, `set-tracking`; 16 KiB bodies) share 30 requests per account per minute. `POST /api/v2/progression/journal` (`auto`, `record`, `clear`; 1 KiB) allows 6 per minute. Limits fail closed when protection storage is unavailable.
- The owner comes only from the session and the character from a fresh adapter link. Every mutation carries the character ID the page was rendered for; a changed link returns 409 `CHARACTER_CHANGED`. Mutations require same-origin JSON. Text renders as plain React text.
- Portal pinned goals reuse the portal's own profile reading, so pinning adds no Console reads.
- Personal data export and erasure (N099) do not yet include planner or journal records; they expire after 90 days without use.
