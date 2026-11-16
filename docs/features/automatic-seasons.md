# Automatic seasons

After one-time administrator setup, the engine generates and publishes numbered three-month seasons, prepares the next season and archives the previous generated season at rollover. Each season has 100 free cosmetic levels, 100 API-observed objectives and cooperative milestones. Game delivery is excluded; generated rewards contain no game grants.

## Setup

1. Open **Admin → Seasons → Automatic season engine**.
2. Set the first season number, first start in UTC and IANA calendar timezone. Start after existing published schedules. Names become `Season 1`, `Season 2`, and onward; existing records are preserved.
3. Use the default observed-level template or select an existing 100-level, 100-reward template with exactly 20 API-observed objectives in each path. Moderator-reviewed objectives cannot enter automation.
4. Type `ENABLE AUTOMATIC SEASONS` and enable the sequence. This audited action authorizes future generation/publication without per-season approvals.
5. Inspect the current/next seasons. Pause stops future generation, publication and archiving; existing active-season progression continues. Resume retains the cursor. Reconfiguration while paused starts a new sequence and retains old records.

Overlaps, reserved numbers/slugs, edited pending rules or invalid configurations stop automation with an explicit reason. Fix the conflict and refresh the policy revision before resuming. No published definition is overwritten. Existing manual seasons are not automatically archived.

## Verification limits

The default uses character levels 5, 10, …, 100 for each path. Existing game progress qualifies: a level-100 character can complete this default immediately, including in later seasons. This recognizes observed milestones; it does **not** prove new seasonal gameplay. More varied automatic objectives require a configured source template with exact journey-node IDs from verified Console data. Existing completed nodes also qualify. No node IDs, player-tag endpoints or historical game activities are invented.

Gathering, crafting, supply delivery, mentoring and exploration evidence still requires moderation in manual seasons. Text/screenshots are never approved automatically. Check live provider compatibility and objective difficulty for your game version.

While a signed-in member views an active automatic season, progress reconciles immediately and every 60 seconds while visible. The server freshly verifies pawn/controller identity before and after at most one progression and one journey read. One atomic Redis operation appends qualifying XP/completions, updates community totals and claims unlocked dashboard cosmetics. Session ownership, explicit capabilities, exact node IDs, six/account/minute limiting, shared capacity and deadlines remain authoritative. Duplicate/concurrent requests cannot award twice. No client XP/proof or game grant is accepted.

Hidden pages stop requests; failures show a refresh control. Returning catches up from supported current state. There is no private-account background scan, saved session-token impersonation or retroactive XP for unobserved gameplay after a season ends. Cosmetics become owned automatically; equipping remains the player's choice. Sound stays opt-in and reduced motion is respected.

## Algorithm, scheduling and recovery

Algorithm v1 persists settings, source template, sequence identity, UUID revision and durable cursor in `arrakis:{seasons}:v1:generator`. Next.js instrumentation starts a non-blocking minute reconciler, with no build-time work. No new environment variable, external queue, migration or dependency is required.

Windows derive from the original UTC anchor plus multiples of three calendar months. Month ends clamp without drift: January 31 → April 30 → July 31. UTC wall time remains constant through DST; the IANA timezone controls display/calendar semantics. Three months is not a fixed 90 days.

The deterministic number seed varies objective ordering, XP weights and theme. Each path has exactly 50,000 XP and the monotonic 100-level curve ends at 49,500 XP, so solo progression independently reaches the cap. Rewards are season-specific permanent copies. Game-reward metadata and external artwork references are removed.

Same-slot CAS fences publication against pause/reconfiguration. Durable pending identity and definition hashes recover creation/publication interruptions across instances. At most current/next seasons are prepared. Extended downtime skips expired empty windows with an audit count while numbering stays sequential; no fictional historical seasons or player progress are created. Archiving uses the normal empty-moderation-queue guard. Histories, ownership and audits never expire automatically. Safety bounds are 99,999 generated numbers and 10,001 anchor windows; exhaustion stops visibly.

## API and testing

Existing `GET /api/v2/admin/seasons` returns an admin-only policy/status projection, excluding the source template. Existing admin POST actions add `generator-configure`, `generator-state` and `generator-run`, using the normal same-origin verified-admin, recent-sign-in, rate-budget, UUID revision and enable-confirmation protections. Member POST adds strict `sync` with only `seasonId`; the owner always comes from the session.

Unit tests cover deterministic generation, month ends/leap years, fairness, unsupported moderation refusal, concurrent schedulers/claims, pause fences, downtime and permanent two-season history. Real standalone/Cluster Lua tests exercise generation, concurrent bulk claims and simulated rollover. Chromium, Safari WebKit, iPhone and Android tests cover admin enablement, automatic publication/progression, authorization, accessibility, screenshots and absence of game writes. Simulated tests change isolated server time; production has no clock override. Emulation does not certify physical devices or assistive technology.

See [community seasons](community-seasons.md), [testing](../development/testing.md) and [battle pass provenance](../legal/battle-pass-provenance.md).
