# Automatic seasons

The dashboard generates, publishes and archives numbered three-month seasons on its own. Each season has 100 free levels, 100 API-observed objectives and cooperative milestones. There is no administrator interface: nothing needs to be configured, approved or moderated.

## How it starts and runs

On a fresh install the `seasons` background worker (see [background workers](../architecture/background-workers.md)) creates its policy once, starts the first season at the next calendar boundary after any existing schedule, prepares the next season and archives the previous one at rollover. Names are `Season 1`, `Season 2`, and onward; existing records are preserved and published definitions are never rewritten.

Overlaps, reserved numbers or slugs, or invalid generated content stop the sequence with a stored reason, and the worker resumes it automatically after an hour. Seasons with moderator-reviewed objectives cannot be generated, because nothing can review evidence.

## Verification limits

Seasons require **new** in-game progress. The first successful observation of a member in an active season records a per-season, per-account baseline (canonical pawn/controller IDs, cumulative game XP, a high-water XP mark and every journey node with its completion state). That first observation grants zero Season XP, even for a level-100 character with a long history; the level-1 cosmetic may still be claimed. Afterwards:

- Game XP gained since the original baseline counts toward objectives. Each path has 20 milestones, each requiring 1,000–20,000 new game XP **or** 1–20 new journey completions, and the five paths keep equal 50,000 Season XP and the 100-level curve.
- Only journey nodes observed changing from incomplete to complete count. Nodes that first appear already complete are treated as historical, and a node that is reset and completed again cannot pay twice.
- A decreasing XP counter fails closed until it recovers past its previous high-water mark; the baseline is never rebased automatically and rewards are never replayed.
- Switching the linked character cannot reset tracking; the original character must be restored. Season 2 starts a fully independent baseline, while Season 1 progress and cosmetics remain permanent.
- Manual and link-only verification are not accepted as evidence of new gameplay, and a template containing a link-only objective cannot be published.

Whether the game's total XP keeps increasing at the level cap is not verified; new journey completions are the alternative signal. A player whose supported counters never change cannot be promised automatic completion, and tracking starts at the first observation rather than at a fictional season-start scan. Live provider staging has not been verified. Published level-only seasons from algorithm v1 stay frozen; a paused v1 policy is preserved until resumed, at which point only future generated seasons use the new template, with an audit event.

Gathering, crafting, supply delivery, mentoring and exploration evidence still requires moderation in manual seasons. Text/screenshots are never approved automatically. Check live provider compatibility and objective difficulty for your game version.

While a signed-in member views an active automatic season, progress reconciles immediately and every 60 seconds while visible. The server freshly verifies pawn/controller identity before and after at most one progression and one journey read. One atomic Redis operation appends qualifying XP/completions, advances the season baseline, updates community totals and claims unlocked dashboard cosmetics. Session ownership, explicit capabilities, exact node IDs, six/account/minute limiting, shared capacity and deadlines remain authoritative. Duplicate/concurrent requests cannot award twice. No client XP/proof or game grant is accepted.

Hidden pages stop requests; failures show a refresh control. Returning catches up from supported current state. There is no private-account background scan, saved session-token impersonation or retroactive XP for unobserved gameplay after a season ends. Cosmetics become owned automatically; equipping remains the player's choice. Sound stays opt-in and reduced motion is respected.

## Intelligent generation engine

The engine is deterministic and dependency-free; it never calls an external AI service and never invents game data. Modules live in `src/features/seasons/engine/` (pure and browser-safe) and `server/`:

| Component                         | Module                                           | Role                                                                                                                       |
| --------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Player capability analyzer        | `engine/capability.ts`                           | Tier (beginner 1-49, intermediate 50-99, advanced 100-149, veteran 150-199, endgame 200), journey capacity, usable signals |
| Objective eligibility and scoring | `engine/kinds.ts`, `engine/assignment.ts`        | Supported kinds only: new game XP, new character levels, new journey completions (any, story, contract, codex, tutorial)   |
| Assignment generator              | `engine/assignment.ts`, `server/observations.ts` | One create-only personal plan per member and season, derived from the immutable baseline                                   |
| Difficulty and XP balancing       | `generation.ts`                                  | Every path keeps exactly 50,000 XP; relative difficulty comes from the published objective                                 |
| Theme and season identity         | `engine/themes.ts`                               | Eight themes, no repeat within eight seasons, never the same theme twice in a row                                          |
| Item eligibility and economy      | `engine/economy.ts`, `server/item-catalog.ts`    | Console catalog classification into reviewed value tiers, per-level/season/currency budgets                                |
| Reward bundle generator           | `engine/rewards.ts`                              | A reward at all 100 levels; milestone levels 10, 25, 50, 75 and 100 are multi-reward bundles                               |
| Simulation                        | `engine/simulation.ts`                           | Runs the real assignment algorithm against synthetic characters at levels 1, 25, 50, 100, 150, 175 and 200                 |
| Validation and publication        | `generation.ts`, `server/generator.ts`           | Unsafe economies are rejected before publication; the existing CAS publication path is unchanged                           |

### Personal plans

When a member is first observed, the immutable baseline (level, XP, every journey node with its completion state and group) is captured. The plan is built from that baseline alone, so the same inputs always give the same plan and a refresh, reconnect or character switch cannot reroll it. Journey objectives are offered only when enough incomplete nodes existed at enrollment. Level-200 characters receive journey objectives only, because game XP gains at the cap are unverified. Late enrollment scales targets down within bounds (never below 40% of the base) and never changes XP rewards. Targets are never raised after assignment. When a character cannot support enough objectives, the plan lists limitations such as the highest level a path can reach instead of promising completion.

Not implemented because no verified evidence exists: gathering, crafting, supply, base building, vehicle ownership, combat and trading objectives. Historical repetition penalties and completion-rate feedback are not yet wired into assignment (the `history` input exists and is unused).

### Rewards and manual claiming

## Algorithm, scheduling and recovery

Algorithm v2 (v1 policies upgrade for future seasons only; the personal-plan algorithm and reward economy are versioned separately) persists settings, source template, sequence identity, UUID revision and durable cursor in `arrakis:{seasons}:v1:generator`. Next.js instrumentation starts a non-blocking minute reconciler, with no build-time work. No environment variable, external queue, migration or dependency is required.

Windows derive from the original UTC anchor plus multiples of three calendar months. Month ends clamp without drift: January 31 → April 30 → July 31. UTC wall time remains constant through DST; the IANA timezone controls display/calendar semantics. Three months is not a fixed 90 days.

The deterministic number seed varies objective ordering, XP weights and theme. Each path has exactly 50,000 XP and the monotonic 100-level curve ends at 49,500 XP, so solo progression independently reaches the cap. Rewards are season-specific permanent copies. Configured game-reward metadata is retained for later reviewed delivery; external artwork references are removed.

Same-slot CAS fences publication against pause/reconfiguration. Durable pending identity and definition hashes recover creation/publication interruptions across instances. At most current/next seasons are prepared. Extended downtime skips expired empty windows with an audit count while numbering stays sequential; no fictional historical seasons or player progress are created. Archiving uses the normal empty-moderation-queue guard. Histories, ownership and audits never expire automatically. Safety bounds are 99,999 generated numbers and 10,001 anchor windows; exhaustion stops visibly.

## API and testing

See [community seasons](community-seasons.md), [testing](../development/testing.md) and [battle pass provenance](../legal/battle-pass-provenance.md).
