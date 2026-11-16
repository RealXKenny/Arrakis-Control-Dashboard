# Arrakis Control Bot release history

<!-- Generated from the bot repository CHANGELOG.md; do not edit manually. -->

## [1.11.7] - 2026-11-05

### Security

- Verify PostgreSQL TLS certificates when `DATABASE_SSL=true`. Previously certificate validation was disabled, allowing man-in-the-middle interception. Operators using a trusted self-signed database server can opt out explicitly with `DATABASE_SSL_VERIFY=false`.

### Changed

- Trigger the release workflow only for CI runs on `main`, so pull request CI no longer queues skipped release runs that show up as skipped checks on `main`.
- Align CI and release workflows with the Dashboard: per-task CI runners (typecheck, lint, test, audit) behind a `verify` gate, PR-number concurrency, a release-commit-on-`main` guard, and a Buildx image build with GitHub Actions layer caching. Add `typecheck` and `audit:prod` npm scripts.
- Remove unused exports (`BlueprintLimits`, `defaultVoiceRoomName`, `voiceGroupDefinition`) to tighten module surfaces.
- Document and expose `DATABASE_SSL_VERIFY` in `.env.example`, the README, the Pterodactyl guide, and the regenerated egg.

### Deployment

- No action is needed for databases with publicly trusted certificates. Self-signed servers must set `DATABASE_SSL_VERIFY=false` or the bot will fail to connect.

### Verification

- Build, lint, full test suite, and production dependency audit pass. Live database TLS behavior was not verified.

## [1.11.6] - 2026-10-26

### Fixed

- Resolve a high-severity Denial of Service vulnerability in `undici` (GHSA-4qv8-2p9j-2685, GHSA-xjj6-f33q-929c) by updating dependencies.

### Deployment

- Pull the updated container image or run `npm install` to apply the secure dependency version.

### Verification

- Production dependency audit and build checks pass cleanly.

## [1.11.5] - 2026-10-19

### Fixed

- Remove role pings from Bot and Dashboard changelog posts and disable all role, user, and everyone mentions, including mentions embedded in external release notes.
- Add a channel-scoped operator replay that resets only Bot/Dashboard changelog receipts and resends published releases under the existing database lock. Preserve the history-import marker, leave panel records untouched, and keep successful receipts if another send fails.
- Follow all GitHub release pages so older changelogs beyond the first hundred are included.

### Deployment

- Pull `ghcr.io/realxkenny/arrakis-control-bot:v1.11.5` (or refreshed `latest`) and restart Pterodactyl to remove role mentions from all future changelogs. Existing role-selection configuration remains unchanged.
- Changelog reset/replay is an explicit operator action for one database/channel; updating alone does not erase receipts or repost history. Other persistent panels and bot data are unaffected.

### Verification

- TypeScript build, ESLint, all 615 tests across 93 files with two workers, production dependency audit, and patch whitespace checks pass locally.
- Production replay outcome is reported separately from release verification.

## [1.11.4] - 2026-10-19

### Added

- Optional `GITHUB_TOKEN` authenticates Bot and Dashboard release checks for a higher GitHub API allowance. The Pterodactyl egg exposes a blank, admin-managed secret variable; tokens remain in runtime configuration and are never bundled in the image. Unconfigured deployments retain public API access.

### Fixed

- Track all history-based persistent public panels in PostgreSQL, including separate server-info sections, music controls/now-playing, and storm schedules. Import existing posts once, recover saved IDs across restarts, serialize publishers across processes, recreate confirmed deleted panels, and stop on permission/network/database errors.
- Persist Bot and Dashboard GitHub changelog announcements in PostgreSQL per channel, repository, and version, saving the Discord message ID immediately after sending. Import existing bot-authored posts once, then use database records instead of scanning history on every check. Deleted announcements stay recorded, refreshes use saved message IDs, overlapping checks share a database lock, and missing/unavailable persistence pauses posting.

### Deployment

- Update the Pterodactyl image to `ghcr.io/realxkenny/arrakis-control-bot:v1.11.4` (or pull the refreshed `latest`) and restart the bot. Keep the existing `DATABASE_URL`; the bot creates its panel and announcement tables automatically.
- Re-import the updated Pterodactyl egg to expose `GITHUB_TOKEN` in admin startup variables, then configure a GitHub token with read access to both release repositories if desired. Authentication raises the API allowance; GitHub rate limits still apply.
- Persistent public panels and GitHub release announcements now require PostgreSQL. On the first run, existing bot-authored messages are imported once; panel discovery pauses if it cannot finish within 10,000 messages. Subsequent checks use saved message IDs. Preserve the new tables in database backups.
- A confirmed deleted interactive panel is recreated, while deleted release announcements remain marked as sent. Database, permission, and network errors pause publication. Discord sends and database writes are separate operations, so a crash or failed write immediately after sending can still leave an unrecorded post.

### Verification

- TypeScript build, ESLint, all 607 tests across 93 files with two workers, production dependency audit, and patch whitespace checks pass locally.
- Live Discord publication and PostgreSQL initialization on the deployed server were not verified. The release workflow builds and smoke-checks the runtime image and Pterodactyl startup contract before publication.

## [1.11.3] - 2026-10-19

### Fixed

- Refresh the production RabbitMQ public trust certificate after the broker update, including the certificate bundled in the Docker image. The certificate is valid from October 19, 2026 through October 19, 2027.

### Deployment

- Update the bot image to this release and restart the bot to load the new certificate. Deployments using an external certificate file must replace that file separately.
- Live broker connectivity and Discord/game chat delivery were not verified locally.

### Verification

- TypeScript build, ESLint, all 545 tests across 88 files with two workers, certificate parsing/self-signature/expiry and matching-copy checks, package version consistency, and patch whitespace checks pass locally.

## [1.11.2] - 2026-10-07

### Added

- Add a safe Status button to the honeypot warning panel with private member-catch and moderation totals. PostgreSQL preserves per-channel statistics across restarts; deployments without a database show clearly labeled session totals.

### Fixed

- Publish the honeypot warning before slower startup tasks, report disabled configuration and missing guild/channel permissions clearly, and fall back to a text panel when artwork cannot be attached or generated.

### Verification

- TypeScript build, ESLint, all 545 tests across 88 files with two workers, production dependency audit, and patch whitespace checks pass locally.
- Live Discord publication and the PostgreSQL migration were not tested against the deployed server. GitHub builds and smoke-checks the runtime image before publication.

## [1.11.1] - 2026-10-07

### Added

- Automatically publish a honeypot warning panel explaining the spam trap, posting consequences, staff exemptions, and support route. Startup and owner panel refresh update the existing warning to match the configured ban, timeout, or log mode.

### Verification

- TypeScript build, ESLint, all 532 tests across 86 files with two workers, production dependency audit, and patch whitespace checks pass locally.
- Live Discord panel publication is not verified locally; the release workflow builds and smoke-checks the Pterodactyl image.

## [1.11.0] - 2026-10-07

### Added

- Opt-in Discord honeypot channel with automatic bans, optional timeout/log modes, current-member staff exemptions, message removal, and incident logging with accurate failure outcomes. Trap messages do not award XP or trigger music replies.

### Fixed

- Remove unused `concurrently` production dependency and its vulnerable `shell-quote` dependency chain so production audits pass without a forced downgrade.

### Deployment

- Regenerate the Pterodactyl egg with honeypot settings. The release workflow builds and smoke-checks the runtime image before publishing `latest`, `v1.11.0`, and the commit-specific image tag.

### Verification

- TypeScript build, ESLint, all 525 tests across 85 files (with two test workers), production dependency audit, and patch whitespace checks pass locally.
- Live Discord moderation and the target Pterodactyl panel were not tested locally. Image build and startup checks run in the GitHub release workflow.

## [1.10.12] - 2026-09-24

### Fixed

- Normalize compatibility-styled Unicode usernames before drawing level, level-up, achievement, and leaderboard images so names such as `𝓔𝓜𝓢𝓖𝓐𝓜𝓔𝓡𝓓𝓤𝓓𝓔` render as readable text instead of missing-glyph boxes.

### Verification

- TypeScript build, ESLint, all 511 automated tests across 83 files, production dependency audit, and `git diff --check` pass locally.
- A generated level-up card using the reported styled username was visually inspected and rendered `EMSGAMERDUDE` without missing-glyph boxes.

## [1.10.11] - 2026-09-21

### Fixed

- Check new GitHub releases before restoring persistent panels, and let a Bot release announcement proceed when the Dashboard release API or another announcement fails.

### Verification

- TypeScript build, ESLint, all 506 automated tests across 82 files, production dependency audit, and `git diff --check` pass locally.
- The Docker image smoke check runs in the release workflow; live Discord announcement delivery still requires deployment verification.

## [1.10.10] - 2026-09-21

### Added

- Add `/achievements [member]` to show saved Bronze, Silver, and Gold unlocks with progress toward every tier.
- Bundle the public production and development RabbitMQ server certificates at `/opt/arrakis/certificates/` in the Docker image and verify both during the release image smoke test.
- Package the compiled bot and bundled artwork as a production Docker image for custom Pterodactyl eggs.
- Publish `latest`, version, and commit-SHA images to GitHub Container Registry only for new stable version releases after successful CI on `main`, with a runtime image smoke check before upload.
- Provide an importable PTDL_v2 Pterodactyl egg covering the bot's environment settings and a setup guide.
- Add an OCI image description to the bot container metadata.

### Changed

- Remove only a member's requested songs when they leave the music voice channel, advancing playback if their song was current.
- Wait up to 30 seconds for Lavalink and the voice player before completing music playback interactions, including a retry for a temporary voice join failure.
- Make the Docker image follow Pterodactyl's `container` user and `/home/container` startup contract while keeping the bundled bot under `/opt/arrakis`.
- Require a valid choice in the self-assignable role menu and provide a dedicated Clear all roles option, avoiding Discord's invalid-form rejection while preserving role removal.
- Log the rejected field path and error code when Discord rejects a panel payload, without exposing submitted values.

### Verification

- TypeScript build, ESLint, all 503 automated tests across 82 files, production dependency audit, and `git diff --check` pass locally.
- Docker image smoke checks and live Discord, Lavalink, RabbitMQ, and Pterodactyl behavior require CI or deployment verification.

## [1.10.9] - 2026-09-20

### Added

- Add dedicated Arrakis field-console artwork for short-lived command, moderation, error, help, review, archive, and other Components V2 responses that did not already have panel-specific art.

### Changed

- Refresh every configured guild's voice panel and both music lounge messages during startup and Bot Control panel refreshes.
- Refresh every previously published bot and dashboard release card in place so changelog announcements adopt the current artwork and layout without being reposted.
- Ensure lyrics, voice-room information, ticket and staff review cards, server-information continuations, and music tracks without remote cover art always include an image.
- Preserve each panel's existing unique artwork while automatically filling only image-less temporary responses.
- Update every new member-join and member-leave card with its dedicated scene, full member avatar treatment, and accessible image description.
- Compact Sapphire's global application-command overwrite report into a short single-line command count before terminal-width fitting.

### Verification

- TypeScript build, ESLint, all 477 automated tests across 78 files, production dependency audit, and `git diff --check` pass locally.
- Live Discord message replacement, lifecycle cards, and release-announcement edits still require deployment verification.

## [1.10.8] - 2026-09-20

### Added

- Add configurable `MUSIC_IDLE_PLAYLIST_URL` waiting music, using the selected Spotify album whenever no member-requested track is active and yielding immediately when a request arrives.
- Add persistent Bronze, Silver, and Gold achievements for rewarded messages, voice participation, and community levels, with atomic one-time unlock claims across restarts and shards.
- Add original cinematic banner artwork for the dedicated level-up card and the separate message, voice, and level achievement card designs, with member avatars and Arrakis-themed announcement copy layered dynamically.
- Add `LEVEL_ANNOUNCEMENT_CHANNEL_ID` so every chat- and voice-earned progression announcement is delivered to one operator-selected channel without pinging members.
- Add 22 original cinematic backgrounds so every existing image-bearing community, operations, player, economy, lounge, release, and member-lifecycle panel has its own scene.
- Add a private, persistent Discord Bot Control Center configured by `BOT_CONTROL_CHANNEL_ID`, with live health, full panel refresh, module reload, service resynchronization, audit logging, and confirmed all-shard restart controls.
- Add original command-center artwork dedicated to the Bot Control Center.
- Add a PostgreSQL-backed Appy-style staff application system with a public five-question form, private review cards, accept/deny reasons, configurable reviewer/pending/accepted roles, applicant DMs, duplicate protection, and reapplication cooldowns.
- Add original staff-application panel artwork and include the panel in startup and Bot Control refreshes.
- Add `npm run env:migrate` to safely rebuild production `.env` files using the boxed `.env.example` layout while preserving values, backups, and unknown custom keys.
- Add a second Blueprint panel link to the Dune Docker community blueprint library.
- Add a PostgreSQL message archive for every guild message, including content, author/channel context, attachments, embeds, components, stickers, replies, flags, and webhook metadata, with durable edit revision history and deletion timestamps.
- Add activity-channel cards for individual edits, deletions, and bulk deletions, recovering original content from PostgreSQL when Discord supplies only a partial uncached message.

### Changed

- Redesign music progress as a player-style play/pause timeline with elapsed time, scrubber marker, duration, and volume cue, including live updates during waiting music.
- Reapply the listen-only server mute immediately when a moderator manually unmutes a member who remains inside the Music Lounge.
- Make console logs terminal-width aware at write time, collapse embedded whitespace, and truncate with an ellipsis before a physical wrap; compact the startup integration summary so all feature states remain visible on typical panels.
- Replace the shared gradient banner with a typed artwork catalog and one consistent aspect-cover renderer, while preserving dynamic panel titles, live values, avatar overlays, attachment names, and accessible descriptions.
- Refresh every persistent panel at startup and from the control center, replacing prior attachments so existing messages adopt their dedicated artwork without changing message IDs.
- Suppress transient release-check fetch failures until five consecutive attempts fail, then report only every fifth failure and log recovery.

### Verification

- TypeScript build, ESLint, all 473 automated tests across 78 files, environment-layout validation, and `git diff --check` pass locally.
- The production dependency audit reports zero vulnerabilities.
- Live Discord panels, staff decisions and role changes, PostgreSQL message capture, edit/delete activity cards, Lavalink waiting-music playback, and immediate Music Lounge re-muting still require deployment verification.

## [1.10.7] - 2026-09-20

### Added

- Add PostgreSQL-backed community leveling with automatic schema upgrades, persistent message/voice activity, server ranking, level-up announcements, and restart-safe XP-event scheduling.
- Add `/level rank [member]` with a personalized desert image card showing the member avatar, level, server rank, total XP, progress, rewarded messages, rewarded voice minutes, current multiplier, earned tier, and next role milestone.
- Add `/level leaderboard` with a separate cinematic night-desert image, top-ten member avatars, ranks, levels, tier names, and total XP.
- Add `/level event schedule|status|stop` for Manage Server administrators to configure persistent 2× XP windows from 15 minutes to seven days, starting immediately or up to 30 days ahead.
- Add `/level roles status` so administrators can verify all eight configured reward-role IDs, role existence, milestone levels, and whether the bot can manage them.
- Add voice participation rewards of 15 XP per minute when at least two eligible human members are active in a non-AFK channel; bots and deafened or suppressed members do not qualify.
- Add automatic highest-tier role assignment for **Arrakis Wanderer**, **Sietch Dweller**, **Desert Survivor**, **Sand Warrior**, **Spice Hunter**, **Fremen Initiate**, **Desert Master**, and **Chosen of Arrakis**.
- Add permanent 2× XP for Discord server boosters and scheduled server-wide 2× events; both bonuses apply to message and voice XP and stack multiplicatively to 4×.
- Add separate generated cinematic assets for personal level cards and the leaderboard, plus selective executable `Dev note:` easter eggs around progression, music, logging, and recovery logic.
- Add a deployable Lavalink v4 template pinned to LavaSrc 4.8.3, with Spotify catalog search, SoundCloud playback mirroring, quality-focused audio settings, safe secret placeholders, and a separate Lavalink environment example.

### Changed

- Clean up `.env.example` by removing redundant leveling knobs, using built-in XP defaults, reusing `GUILD_ID` for music and voice-room configuration, and retaining the old feature-specific guild variables only as migration fallbacks.
- Move every level reward role ID into the explicit `LEVEL_ROLE_*_ID` environment settings and document the required Discord role hierarchy and Manage Roles permission.
- Replace the previous one-minute message reward lock with atomic eight-second rapid-spam protection and recent-message fingerprint blocking. Meaningful messages now earn a dynamic 8–25 base XP from length, vocabulary, variety, attachments, and reply context.
- Increase progression to a demanding `250 × level²` cumulative XP curve and award the eight roles only at milestone levels 1, 10, 20, 30, 40, 50, 60, and 70, keeping only the member's highest earned tier.
- Streamline `/level rank` and level-up announcements into accessible image-first panels, fit avatars across the full circular halo, correct panel spacing, and simplify supporting text.
- Give the leaderboard its own image layout instead of reusing the personal level card design.
- Expand lyrics retrieval from strict LRCLIB metadata matching to staged exact, full-title and scored remix/mashup fragment searches, with 15-minute caching and matched-recording attribution.
- Add elapsed/total time and an 18-segment playback bar to music status views, with a throttled 15-second refresh for the public now-playing card.
- Parse `"Song Title" by Artist` requests and rank Lavalink search results by title, artist and noisy cover/remix/live markers instead of always accepting the first result.
- Extend music matching with `Artist - Song Title` parsing, symmetric token precision, ISRC preference, and penalties for previews, snippets, tributes, fan uploads, performances, and rehearsals.
- Raise the new-install music default from 30% to unity gain at 100% and document a high-quality Lavalink profile using Opus quality 10, high resampling, stable buffers, and SoundCloud preview filtering.
- Make `spsearch` the recommended new-install search source, accept Spotify, Apple Music and Deezer links, and support `spsearch`, `amsearch`, and `dzsearch` alongside the existing Lavalink search prefixes.
- Replace context-free music activity receipts with one post-action Discord audit card containing the submitted query or volume, success/rejection/expiry outcome, interaction ID and timestamp, user/display name, server/channel IDs, locale, playback position, volume, Lavalink/voice state, current track/requester, public track URL, and up to eight queued songs.

### Fixed

- Correct singular activity labels on rank cards so counts such as `1 message` and `1 voice minute` render naturally.
- Treat Discord `10062 Unknown Interaction` responses as terminal, acknowledge music controls before slow work, and avoid repeated fallback replies and duplicate error logs for expired interaction tokens.
- Join the Music Lounge undeafened without changing its human listen-only mute policy.
- Avoid duplicate pre-action music audit entries, exclude lyrics text from activity logs, and strip query strings from logged track URLs to prevent accidental credential leakage.
- Suppress routine Discord shard disconnect/reconnect/resume noise through five consecutive attempts, emit one warning on attempt six, report recovery only after a warned episode, and remove the duplicate parent shard-manager reconnect line.

### Verification

- TypeScript build, ESLint, all 437 automated tests across 69 files and `git diff --check` pass locally. The production dependency audit reports zero vulnerabilities.
- Live Discord card rendering, role assignment, voice XP, Lavalink audio/search, LRCLIB matching, and activity-log delivery still require deployment verification.

## [1.10.6] - 2026-09-20

### Added

- Add repository-wide `AGENTS.md` guidance covering the current project layout, architectural ownership, Sapphire store rules, Discord Components V2 constraints, security requirements, feature invariants, testing, documentation, Git safety and completion criteria. Retire the superseded `PROJECT_STRUCTURE.md` and link the new guide from the README.
- Add a `CI` GitHub Actions workflow for Node.js 24 dependency installation, linting, build/tests and production dependency auditing on pushes and pull requests targeting `main`.
- Add a post-CI `Release` workflow that publishes only successful `main` revisions with a new stable `package.json` version and matching non-empty changelog section. Existing tags, failed CI runs and pull-request runs are skipped safely.
- Add cached subsystem child loggers with dedicated colors and scopes for system startup, configuration, storage, Sapphire, Discord gateway, community tasks, commands, chat bridge, music, Lavalink, voice, players, market, moderation, server operations, backups, updates, tickets, releases and interactions.
- Add recursive structured-log redaction for passwords, tokens, cookies, authorization values, sessions and API keys, with production-safe error serialization and request-context logger support.

### Changed

- Redesign console output with severity icons, colored subsystem scopes, compact JSON details and a boxed Arrakis Control startup banner while preserving plain formatted log lines when color is disabled and honoring configured log thresholds.
- Clear the terminal screen, scrollback and cursor position before printing the startup banner by writing terminal control sequences directly, including for hosted Pterodactyl consoles that do not report stdout as a TTY.
- Route every framework/client logging call through its owning subsystem instead of the generic `[BOT]` scope, while retaining Sapphire compatibility and cached logger instances for frequent event paths.
- Make `/help` public while keeping its category/page controls bound to the requesting member and its 15-minute session expiration.
- Silence expected music recovery-loop warnings and successful RabbitMQ per-message publish summaries. Recovery, preserved playback state, partial-delivery warnings and failed-delivery notices remain active.
- Synchronize README guidance with version `1.10.5`, the public 81-command help catalog, production-only dependency auditing and the automatic release process.

### Fixed

- Declare `MessageFlags.IsComponentsV2` on the edited `/help` response rather than on the deferred acknowledgement, preventing Discord from rejecting the top-level container as a legacy component row.
- Restrict Discord snowflake validation to the bot's declared ID settings so GitHub Actions variables such as `GITHUB_REPOSITORY_OWNER_ID` cannot break configuration tests or startup validation.

### Verification

- TypeScript build, ESLint, all 392 automated tests across 58 files, workflow YAML parsing, changelog/version validation and `git diff --check` pass locally. The production dependency audit reports zero vulnerabilities.
- Live Discord presentation, Pterodactyl terminal clearing and the first GitHub Actions CI/release run still require deployment verification.

## [1.10.5] - 2026-09-17

### Fixed

- Recover silent music stalls after 30 seconds without playback progress, preserve the current song and position, and prevent duplicate errors from delaying retries. Allow authorized Skip, Stop and Clear Queue while Lavalink is unavailable.
- Remove obsolete server-specific slash commands after verifying successful global command synchronization; retain context menus and report cleanup failures.

### Added

- Display lyrics inside Discord with private pagination, cached LRCLIB lookups, instrumental handling and a Genius fallback.
- Add `/server-usage` with server autocomplete, all five history windows, average/maximum aggregation and four resource charts from Convoy's combined metrics endpoint.

## [1.10.4] - 2026-09-17

### Added

- Bundle all eight supplied game catalogs, with item, skill, vehicle/template and journey autocomplete plus `/player catalog` reference search.
- Validate known skill levels, vehicle/template pairs and grant-item augment compatibility. Unknown identifiers remain available for newer game content.
- Use catalog names when live market names are missing, and show Hagga sub-region labels when player data includes a matching map and area ID.
- Add a complete command migration table and data catalog documentation. Market seed data is reference-only and never replaces live prices or creates listings.

### Changed

- Consolidate the bot into 11 top-level commands: `/bot`, `/player`, `/backup`, `/server`, `/update`, `/moderation`, `/music`, `/voice`, `/market`, `/storm` and `/help`.
- Preserve action options and owner/staff checks while moving reusable implementations out of the command loader. Remove unused standalone command classes and use descriptive catalog aliases.
- Synchronize the complete command list in one bulk update so retired commands cannot exhaust Discord's 100-command limit during migration.
- Update help, guides and configuration examples for grouped commands.

### Fixed

- Start Lavalink recovery immediately and retry 10 seconds after each failed attempt, without overlapping recovery operations.
- Preserve the current song, saved position and queue through load failures, connection drops, voice disconnections and playback exceptions instead of skipping.
- Ignore retired-player events and protect checkpoints until restored playback starts. Reject interrupted recovery attempts instead of marking them successful.
- Recognize Discord.js's actual `SHARDS` environment variable so only the primary shard registers commands and performs shared announcements.

### Upgrade notes

- Restart after deploying to synchronize the 11 command groups. Use `/help` or `guides/commands.md` to find the new names; music and voice panel buttons continue working.
- Existing `OWNER_ROLE_ID`, music, voice and database settings remain valid. Clear Queue and Stop Playback still require the Owner role and voice membership.
- Include the bundled `data` directory in deployments; the TypeScript build copies the JSON catalogs into `dist/data`.
- Recovery resumes the last known position, so sudden disconnects can replay a few seconds. Permanently unavailable tracks remain queued until explicitly skipped or stopped.

### Verification

- Build, lint and all 366 automated tests across 55 files passed. Production dependency audit: zero vulnerabilities.
- Offline checks cover grouped registration, per-action access, catalog schemas/options and music recovery. Live Discord, Lavalink and Console behavior still requires deployment testing.

## [1.10.3] - 2026-09-17

### Added

- Song-start DMs with artwork and a music lounge link; blocked DMs do not interrupt playback.
- View Lyrics button with a private Genius search link for the current song.
- Convoy setup guide covering team-scoped keys, permissions and rate limits.

### Changed

- Keep one Now Playing card, update it in place, consolidate duplicate bot cards and clean processed text requests/replies after 15 seconds.
- Replace music subcommands with `/play`, `/queue`, `/now`, `/skip`, `/pause`, `/resume`, `/volume`, `/stop`, `/clear` and `/music-panel`.
- Restrict Clear Queue and Stop Playback to `OWNER_ROLE_ID`, including slash commands and fresh role checks on confirmation. Voice membership is still required.
- Pause Lavalink during graceful shutdown and save its final reported position. Restart recovery preserves remaining song time, queue, volume and original paused state; abrupt crashes use the last checkpoint.
- Replace repeated storm announcements with one persistent panel showing upcoming, active and awaiting-cycle states; remove the technical API footer and consolidate existing bot storm panels.
- Replace the voice command group with 13 standalone `/voice-*` commands, preserving creator-only room controls and administrator-only setup.
- Redesign startup with a compact Arrakis banner, numbered phases and a chat-route summary. Preserve console history across restarts and use plain text for redirected logs.
- Update Convoy server listing to `/api/v1/client/servers`, nested primary IP addresses, `server.read` permission guidance and Retry-After rate-limit errors.

### Upgrade notes

- Restart the bot to synchronize standalone slash commands and refresh existing panels. The old `/music` and `/voice` command groups are replaced.
- Set `OWNER_ROLE_ID` for Clear Queue and Stop Playback. Other playback controls remain limited to the current requester.
- Grant Manage Messages in the music request channel for request cleanup. PostgreSQL remains required for music recovery.
- Convoy keys need `server.read` for the intended team. Existing origin-only `API_URL` values remain supported.

### Verification

- Build, lint and all 286 tests across 53 files passed; the production dependency audit reported zero vulnerabilities.
- Live Discord panels, Lavalink playback and the production Convoy API require deployment testing.

## [1.10.2] - 2026-09-17

### Added

- Listen-only music voice: server-mute human listeners on entry and restore bot-owned mutes on exit. PostgreSQL preserves pending cleanup across restarts; disconnected members are restored on their next voice connection outside the lounge. Pre-existing server mutes are preserved.

- Track artwork in the music panel's Now Playing response and `/music now`, with YouTube thumbnail fallback.

- Public Music Lounge panel with song-request and volume forms, queue/current-song views, playback buttons, and stop/clear confirmations. Automatically reuses the panel after restarts; `/music panel` lets administrators refresh it. Playback controls recheck voice membership on submission.

- Optional Lavalink v4 music lounge with a permanent voice connection, automatic connection recovery, text song requests, `/music` queue/playback controls, listener checks, and bounded playlists/queues. Settings are documented in `.env.example`.

- Persistent join-to-create voice rooms with `/voice` setup and owner commands, a shared control panel, database-backed ownership, startup reconciliation, and empty-room cleanup. Controls require the creator to be inside their own room; interrupted creation is recoverable through persisted channel markers.

- Resolve game-to-Discord sender labels to in-game character names through the Console player directory, with exact Funcom ID matching, paginated caching, online-character preference and sender-ID fallback when resolution is unavailable or ambiguous.

### Changed

- Music playback controls belong to the current song's requester while in voice. PostgreSQL now saves queued tracks, requester ownership, volume, pause state, and five-second playback checkpoints for restart recovery; music requires `DATABASE_URL`.

- Redesign the public voice panel with an Arrakis banner, grouped controls, clear button labels and a direct join-channel link; existing panels upgrade in place.

- Close independent bot resources even when another cleanup fails or hangs, and clear completed shutdown timers.
- Reuse the log timestamp formatter and stop overlapping version announcement checks.
- Consolidate bounded download handling and report explicit Console failures and Convoy network errors consistently.

### Fixed

- Preserve help and market sessions during reads at capacity, with direct expiry checks on reads and bounded cleanup on insertion.
- Suppress concurrent duplicate game messages and continue relaying to other Discord destinations after a channel failure.
- Reject Convoy routes outside the configured origin and accept successful empty responses.

### Upgrade notes

- Music requires `DATABASE_URL`; its queue, playback checkpoints and pending voice unmutes are stored automatically. Supply the new `LAVALINK_*` and `MUSIC_*` settings from `.env.example` to enable it.
- Grant music panel access, Attach Files and Embed Links, plus Connect/Speak in the music voice channel and Mute Members wherever listener mutes must be restored. Fully disconnected listeners are unmuted on their next voice connection outside the lounge.
- Configure join-to-create rooms with `/voice setup` or the `VOICE_*` environment settings. Playback controls require the current song's requester; room controls require the room creator.

### Verification

- Build, lint and 264 automated tests across 50 test files pass. Live restart recovery, voice permission behavior and Lavalink source availability require deployment testing.

## [1.10.1] - 2026-09-17

### Changed

- Display readable map names in Discord, including Hagga Basin, Hagga Basin PvP, Deep Desert PvP/PvE, Arrakeen, Harko Village and World Overmap. Exact AMQP routing keys are unchanged; unknown maps retain their routing key as a label.
- Use readable map names in delivery-failure replies and bound long destination lists to Discord message limits.

### Removed

- Removed proximity forwarding, the global intercept subscription and proximity-route configuration following deployment testing. The bridge supports map chat only; Discord-role Owner tags and concise publish logs remain.

### Verification

- `npm test` passes with 177 tests across 37 test files; build, lint, dependency audit and diff checks pass.

## [1.10.0] - 2026-09-17

### Added

- Opt-in server-wide proximity-to-Discord forwarding through a separate `chat.intercept` subscription, with `[Proximity]` labels, duplicate suppression, and strict exclusion of other channel types.
- Proximity subscription failures are isolated from map chat. Discord-to-game messages remain map-only.

### Changed

- Apply `[Owner]` to Discord-to-game messages directly from `OWNER_ROLE_ID`; remove chat's verified-player lookups and the associated Adapter requests. Incoming game messages no longer receive an Owner label.
- Simplify publish logs to report how many map messages RabbitMQ accepted, without the repeated game-client display disclaimer.

### Verification

- `npm test` passes with 173 tests across 37 test files; build, lint and dependency audit pass.
- The configured broker accepted a temporary intercept subscription. Live proximity payload/display verification remains deployment-specific; only explicit `Proximity` messages are forwarded.

## [1.0.9] - 2026-09-17

### Added

- Bidirectional Discord and Dune map chat through a remote RabbitMQ broker, with verified TLS, private certificate trust and configurable certificate hostname.
- Configurable routing for all seven documented map keys, supporting shared Discord channels or separate channels per map without code changes.
- `[Owner]` labels on game-to-Discord messages, resolved through verified player links and the existing `OWNER_ROLE_ID` in the destination Discord server.
- A complete setup and troubleshooting guide in `guides/`, including persona SQL templates, remote networking, authentication and TLS setup.
- Public development and production RabbitMQ certificates; no private keys or credentials are included.

### Changed

- Added independent per-map publisher confirmations, partial-failure reporting, bounded receive queues, reconnect handling, echo suppression and graceful bridge shutdown.
- Kept routine chat logs concise and removed temporary full-payload JSON diagnostics.
- Moved setup material into `guides/` and removed the temporary `docs/` directory.
- Updated package and lockfile versions to 1.0.9.

### Verification

- `npm test` passes with 170 tests across 38 test files, including map routing and Owner-role resolution.
- `npm run lint`, `git diff --check` and the production dependency audit pass.
- Discord-to-game delivery was confirmed in development after persona platform metadata was populated and the game client was restarted. Other map destinations and production still require deployment-specific smoke tests; broker confirmations do not prove game-client display.

## [1.0.8] - 2026-09-17

### Changed

- Updated the Server Info panel to use the new import path.

### Verification

- `npm test` passes with 142 tests across 35 test files.
- `npm run lint` and `git diff --check` pass for version 1.0.8.

## [1.0.7] - 2026-09-14

### Added

- Interactive `/market` browser backed by the Dune Console exchange API, with category filtering, search, stable pagination, live stock and listing totals, and lowest asking prices.
- Market buyback guidance calculated from the configured buyback percentage and each item's lowest asking price.
- Interactive `/help` browser with domain and feature navigation for the expanded command catalog.
- Standalone owner-only server lifecycle, service, network-repair, Docker cleanup, update-management, backup-management, and player-mutation commands.
- Restart Queue support for full-server and individual-service restarts, including queued responses, concurrency conflicts, and an immediate-restart option.
- Credential-free Vitest coverage for domain modules, infrastructure clients and repositories, Sapphire store discovery, shared Discord builders, access controls, validators, and action orchestration.

### Changed

- Reorganized commands, interaction handlers, listeners, preconditions, modules, infrastructure, shared utilities, support code, and tests into a consistent domain-first `store/domain/feature/piece.ts` layout.
- Kept Sapphire's top-level piece-store roots intact while grouping interaction handlers by feature instead of scattering related buttons, menus, and modals by component type.
- Split large multi-action command surfaces into predictable standalone slash commands while retaining thin command execution layers over domain services.
- Expanded project documentation to describe the production directory tree, command organization, Market Board integration, owner-only operations, and testing boundaries.

### Fixed

- Kept the server information panel below Discord's 4,000-character displayable component-text limit by splitting and bounding panel content.
- Removed obsolete example configuration text that was not a valid environment variable.

### Security

- Restricted server lifecycle, maintenance, updates, backups, service restarts, and player mutation operations to the configured owner role.
- Kept tests fully offline by mocking Discord interactions, PostgreSQL pools, and external HTTP clients; no bot token, database, gateway, or live Console is required.

### Verification

- `npm test` passes with 142 tests across 35 test files.
- `npm run lint` and `git diff --check` pass for version 1.0.7.

## [1.0.6] - 2026-09-10

### Added

- Sapphire-compatible logger adapter that applies the Arrakis timestamp, level, and scope format to framework and `container.logger` output.
- Typed, immutable source catalog containing all 354 Dune Console API endpoints.
- Regression coverage for Sapphire logger formatting, log-level thresholds, endpoint catalog completeness, and catalog immutability.
- API-backed Coriolis storm panels with localized Discord timestamps, a 24-hour storm window derived from `coriolisNextCycleAt`, cycle-level duplicate detection, and automatic restoration when a panel is missing.
- Public `/storm` command for retrieving the current Coriolis schedule on demand.
- Persistent Crimson Skies FAQ panel with a generated Dune-style banner and startup updates in place.

### Changed

- Route Sapphire framework logs through the central `[BOT]` logger so application-command registration, readiness, commands, handlers, listeners, and preconditions share one output format.
- Load the Dune Console endpoint catalog directly from compiled source instead of parsing Markdown from the working directory at startup.
- Updated architecture and setup documentation to describe the compiled endpoint catalog.
- Added dedicated `STORM_CHANNEL_ID` and `FAQ_PANEL_CHANNEL_ID` configuration for automatic panel destinations.

### Fixed

- Prevented duplicate Coriolis announcements while ensuring deleted or absent cycle panels are recreated.

### Verification

- `npm run build`, `npm run lint`, `npm test`, `npm audit --omit=dev`, and `git diff --check` pass for version 1.0.6.

### Removed

- Runtime dependency on external API reference documents.
- The obsolete `docs/` and `scripts/` directories.

## [1.0.5] - 2026-09-09

### Added

- Native `@sapphire/framework` integration, adopting top-level stores (`commands`, `interaction-handlers`, `listeners`, `preconditions`).
- Centralized `ArrakisClient` subclass under `src/client/` for unified client composition and lifecycle management.
- Credential-free store discovery and interaction routing tests under `tests/stores/`.
- Typed fallback handlers for stale message controls and modal submissions.
- Modular framework error boundaries and precondition denial listeners.

### Changed

- Flattened presentation directory structure by removing `src/app/` and placing store directories directly under `src/`.
- Lifted client orchestration (`ArrakisClient`, `BotApplication`, `shard.ts`, `logger.ts`) from `infrastructure/core/` to top-level `src/client/`.
- Reorganized `tests/` to mirror `src/` 1:1 (`tests/client/`, `tests/stores/`, `tests/infrastructure/`, `tests/modules/`, `tests/shared/`).
- Rewrote `PROJECT_STRUCTURE.md` to reflect Clean Architecture domain boundaries and top-level store mappings.

### Removed

- Legacy custom dynamic loaders (`commandLoader.ts`, `componentLoader.ts`, `eventLoader.ts`, `fileLoader.ts`).
- Obsolete manual store path overrides in client composition.
- Redundant and outdated test files in `tests/`.

## [1.0.4] - 2026-09-09

### Changed

- Release changelog messages sent to Discord Announcement channels are now published automatically after posting.
- Ticket archive JSON now references transcript metadata instead of duplicating the full transcript that is already stored in PostgreSQL and attached as a `.txt` file.

### Fixed

- Bound combined Components V2 display text for release announcements, ticket cards, ticket archives, closure receipts, audit logs, server status, VPS server lists, backups, player lists, and profiles.
- Bound API-provided traditional reply content to Discord's 2,000-character message limit.
- Normalize release and audit attachment filenames and preserve their extensions within a safe length.
- Skip oversized blueprint audit re-uploads and stream accepted attachments through a 10 MiB bounded reader.
- Keep ticket archive and closure payloads below Discord's per-file and total request-size limits without discarding the authoritative PostgreSQL transcript.

### Verification

- `npm run build`, `npm run lint`, `npm test`, `npm audit --omit=dev`, and `git diff --check` pass for version 1.0.4.

## [1.0.3] - 2026-09-09

### Added

- PostgreSQL-backed ticket storage with automatic schema upgrades, active-ticket uniqueness, and lifecycle metadata.
- Exclusive scoped Dune Console API-key authentication.
- Persistent Dune-styled support panel with category-first private ticket creation for account linking, technical support, player reports, guild and community help, gameplay and server help, and general requests.
- Detailed ticket intake for support type, description, prior troubleshooting, and impact or urgency.
- Automatic linked Dune character enrichment, including character name, online status, pawn ID, and controller ID when available.
- Durable ticket transcripts stored in PostgreSQL, with an optional `.txt` copy posted to a configured Discord archive channel.
- Private ticket-closure receipts containing the full request, linked Dune details, closure metadata, transcript attachment, and review prompt.
- PostgreSQL-backed ticket reviews with a 1-5 rating, resolution status, optional comments, submission timestamp, and in-place staff archive updates.
- Staff ticket claiming and release controls with durable handler identity, claim time, and protection against another staff member closing an assigned ticket.
- One persistent archive container per ticket with complete lifecycle, intake, linked Dune account, handler, transcript, and review information plus `.txt` and structured `.json` attachments.
- Regression coverage for ticket channel names, linked-account presentation, transcript content, and PostgreSQL environment validation.

### Changed

- Console startup now requires `CONSOLE_API_KEY`; password login and all browser-session, cookie, CSRF, reauthentication, and logout code have been removed.
- Ticket categories are selected from the panel and carried into the modal, PostgreSQL record, and private channel name instead of relying on a free-form category answer.
- The ticket panel now uses a larger purpose-built support banner, balanced category artwork, shorter guidance, and cleaner privacy/status callouts.
- Closing a ticket now captures its conversation and attachment references, archives the transcript, and automatically deletes the private Discord channel.
- Member reviews now edit the ticket's original archive container and replace its JSON record instead of posting a separate review message.
- Ticket closure now attempts the creator's DM receipt before deleting the channel and reports blocked DMs to the closer without interrupting archival.
- The bot now requests the `GuildMessages` and privileged `MessageContent` intents required for complete ticket transcripts.
- Runtime configuration and architecture documentation now cover PostgreSQL, ticket channels, transcript archives, and hosted-database TLS.
- Local development now runs a single shard directly by default, with explicit watch and single-process production scripts available when sharding is unnecessary.

### Fixed

- Detect parent-process and shard-manager IPC loss so Windows development and managed shutdowns do not leave orphaned Node.js shard processes behind.
- Wait for shard children during manager shutdown, force only after a bounded timeout, and prevent cleanup failures from blocking process exit.

### Security

- Console API requests reject cross-origin routes before attaching bearer credentials.
- Console URLs containing embedded username or password credentials are rejected so bearer API keys remain the only Console authentication path.
- Ticket channels are visible only to the creator, the bot, and configured staff roles.
- PostgreSQL enforces one active ticket per member and server, including concurrent creation attempts.
- Ticket creation rolls back both the database reservation and Discord channel when provisioning fails.

### Verification

- `npm run build`, `npm run lint`, `npm test`, `npm audit --omit=dev`, and `git diff --check` pass for the in-progress 1.0.3 changes.

## [1.0.2] - 2026-09-08

### Added

- Regression coverage for blueprint uploads, Discord Adapter response normalization, CAPTCHA verification, moderation authorization, oversized attachments, and non-idempotent request failures.
- Explicit Vitest configuration that excludes generated `dist` tests from source test discovery.

### Changed

- Development mode now runs through `tsx`, and runtime loaders support both TypeScript source files and compiled JavaScript files.
- Moderation, purge, role-selection, and membership-verification interactions acknowledge Discord promptly before performing slower API operations.
- Self-assignable role updates add requested roles before removing deselected roles to reduce partial-update failures.
- CAPTCHA codes now use cryptographically secure randomness and avoid ambiguous characters.
- Startup panel publication failures are isolated so one unavailable panel does not prevent other panels or version announcements from initializing.
- Updated Vitest, Node.js types, and TypeScript ESLint dependencies to their current compatible versions.

### Fixed

- Preserve pawn IDs, controller IDs, character details, status fields, and verification metadata returned by the Discord Adapter.
- Resolve blueprint uploads against the correct linked pawn or controller instead of accidentally selecting an unrelated player with missing identifiers.
- Continue checking valid offline timestamps when an earlier upstream timestamp is malformed.
- Return actionable responses for genuinely missing pawn IDs and stale Discord components instead of leaving failed interactions.
- Prevent `/kick` from checking the target's staff role instead of the requesting moderator's role.
- Enforce requester-versus-target role hierarchy for bans, kicks, and timeouts, including owner and self-action protection.
- Prevent non-idempotent Console API requests from being retried after ambiguous network failures.
- Bound streamed blueprint downloads before buffering the entire attachment in memory.
- Apply timeouts to GitHub release checks and reduce optional unconfigured audit destinations to debug-level noise.

### Security

- Closed an authorization path that could allow a non-staff member to invoke `/kick` against a staff target when the bot's Discord role was high enough.
- Prevent junior staff from moderating peers, senior staff, the guild owner, or themselves through bot commands.
- Removed the vulnerable Vitest dependency chain reported by `npm audit`.

### Verification

- `npm test` passes with 25 tests across 8 test files, including after generating `dist` output.
- `npm run build` passes.
- `npm run lint` passes.
- `npm audit` reports 0 vulnerabilities.
- Source mode loads all 13 commands and 10 component handlers without skips.
- Compiled mode loads all 13 commands, 10 component handlers, and 4 event handlers without skips.

## [1.0.1] - 2026-09-07

### Added

- Release announcements for both Arrakis Control Bot and Arrakis Control Dashboard from their GitHub repositories.
- Project labels in announcement cards and banners, with links to the project repository and full release notes.
- Regression tests for matching project versions and announcement deduplication.

### Fixed

- Track bot and dashboard versions independently so matching version numbers can both be announced.
- Recognize existing bot announcements to avoid reposting releases after the upgrade.
- Publish combined release history in chronological order.

## [1.0.0] - 2026-09-06

Initial production release.

### Added

- Modular Discord.js v14 bot architecture with dynamic command, component, and event loading.
- General commands for ping, information, user lookup, and message purging.
- Moderation commands for bans, kicks, and timeouts with execution-time permission checks.
- Player linking, verification, profile, and player listing workflows.
- Server status, server listing, and backup management commands through the Dune Console API.
- Blueprint upload validation and panel workflow for Discord-hosted blueprint files.
- Self-assignable role panel and member CAPTCHA verification flow.
- Persistent panel publishing for rules, server information, player linking, verification, roles, and blueprint uploads.
- Convoy and Discord Adapter integrations with bounded request timeouts and safe error handling.
- Dune Console client with authentication, typed endpoint access, safe idempotent retries, and logout during shutdown.
- Process-local rate limiting with bounded storage and configurable cooldown and entry limits.
- Structured logging with configurable levels and redaction of credentials and authorization headers.
- Shard manager lifecycle with graceful shutdown on `SIGINT` and `SIGTERM`.
- Strict TypeScript compilation, ESLint checks, credential-free automated tests, and reproducible npm dependency locking.
- Runtime configuration template and deployment guidance for Node.js 24 or newer.

### Security

- Required runtime configuration fails fast before Discord login.
- Production integration URLs require HTTPS.
- Privileged actions validate authorization when executed.
- Blueprint URLs are restricted to Discord CDN hosts and checked against upload size limits.
- External API failures are reduced to safe user-facing messages.
- Secrets and generated build output are excluded from version control.

### Verification

- `npm run build` passes.
- `npm run lint` passes.
- `npm test` passes with 9 tests across 4 test files.
- `npm audit --audit-level=high` reports 0 vulnerabilities.

[1.0.7]: https://github.com/RealXKenny/Arrakis-Control-Bot/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/RealXKenny/Arrakis-Control-Bot/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.5
[1.0.4]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.4
[1.0.3]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.3
[1.0.2]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.2
[1.0.1]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.1
[1.0.0]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.0
