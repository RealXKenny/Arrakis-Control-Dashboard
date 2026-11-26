# Arrakis Control Bot release history

<!-- Generated from the bot repository CHANGELOG.md; do not edit manually. -->

## [2.0.1] - 2026-11-26

### Added

- Automatic updates for Pterodactyl. The egg now starts an update supervisor that installs verified releases at startup and on a schedule: stable or prerelease channel, a version pin through `RELEASE_TAG`, a check interval, an optional UTC maintenance window and an optional read-only GitHub token (`AUTO_UPDATE_*`). Each release is checked against its checksum, GitHub's digest and a new per-file manifest, built in a staging folder (including the native `canvas` check) before the bot is stopped, and rolled back if it does not start. Files you changed or added, such as `.env`, certificates and custom folders, are never overwritten; a conflicting update is skipped and each path is logged.
- `CONSOLE_TIMEOUT_MS` sets the Dune Console request timeout (default 30 seconds).
- Changelogs in a forum channel. Point `ANNOUNCEMENT_CHANNEL_ID` at a forum and every release gets its own post, titled like `Bot v2.0.1 release notes`: a short card with the version, date, summary and links, followed by the complete notes split across as many messages as needed, in order. Posts are tagged by product (`Bot`, `Dashboard`) and release type (`Major`, `Minor`, `Patch`); the bot creates missing tags on startup without duplicating existing ones. A text or announcement channel still works: it gets the short card, with the full notes in a thread on it. The bot release is still posted before the dashboard release.
- Suggestion forum assistant: tags new suggestion posts, replies to the suggester with varied wording, lists similar posts, summarizes long discussions, and adds a staff-only status panel (Planned, Working on it, Back burner, Not doing, Added) to each post. Runs locally with no paid AI service.
- `/suggestions` command: `similar`, `summary`, `status`, `panel`, and `feature start`, `link`, `done` and `list` to move every suggestion a piece of work covers to In Progress and then Implemented.
- New optional settings `SUGGESTIONS_FORUM_CHANNEL_ID`, `SUGGESTIONS_AUTO_TAG`, `SUGGESTIONS_STATUS_PANEL`, `SUGGESTIONS_NOTIFY_AUTHOR`, `SUGGESTIONS_CREATE_TAGS`, `SUGGESTIONS_DUPLICATE_THRESHOLD`, `SUGGESTIONS_AUTO_SUMMARY_MESSAGES` and `SUGGESTIONS_BACKFILL_LIMIT`. See `guides/suggestions.md`.

### Fixed

- Slash commands register again once Discord Activities are enabled. Discord adds an Entry Point command for the Activity and rejected the bot's global command sync without it (error 50240), so `/poker` and new or changed commands were not synchronized. The bot now keeps the Entry Point command when it syncs.
- Long changelogs are no longer cut off. On every start the bot checks the releases it has already posted, moves notes out of older cards that held them (such as Dashboard v2.0.0) into the release's thread or post, adds missing parts and corrects changed ones. Correct posts are left alone and a release is never announced twice.
- The release workflow's publish job names the repository for `gh release create`. It has no checkout, so the 2.0.0 release failed with "not a git repository" after a successful build.

### Changed

- Easier-to-read logs. Errors print as one `Name: message` line instead of a JSON block with the stack; set `LOG_LEVEL=DEBUG` to see stack traces. Discord API error messages stay visible in production.
- The `METRICS` line prints every 30 minutes instead of every minute (every sample is still shown with `LOG_LEVEL=DEBUG`). It still prints at once, with a warning, when the gateway or PostgreSQL is down, queries are waiting for a connection, the event loop is slow, Discord rate-limits a request or a circuit opens, and when health changes. `HEALTH_FILE` still updates every interval.
- RabbitMQ chat warns once per distinct connection problem instead of on every retry, repeats a short summary every tenth attempt, and says how many attempts the recovery took.
- Startup logs name the server, the honeypot channel and the ticket panel channel alongside their IDs, and dotenv no longer prints its own banner.
- Dependency updates: discord.js 14.28.1, amqplib 2.4.1, pg 8.23.1, dotenv 18, ESLint 10, Vitest 5.1, and current GitHub Actions versions.
- Dune Console outages are quieter and clearer: individual failed or retried reads are logged at DEBUG, a sustained outage logs one warning (and a summary at most every ten minutes), and recovery logs one line. Failed writes are still warned about and are never retried. Logged routes no longer include player or account IDs.
- Console reads retry with jittered exponential backoff and honour a short `Retry-After`.
- The Pterodactyl egg hides credential variables (`TOKEN`, `CONSOLE_API_KEY`, `ADAPTER_TOKEN`, `API_KEY`, `DATABASE_URL`, `RABBITMQ_URL`, `LAVALINK_PASSWORD`, `AUTO_UPDATE_GITHUB_TOKEN`) from the server owner and subusers; a panel administrator enters them. Reinstalling over an existing installation no longer changes any file.
- The README follows the dashboard's layout; detailed feature documentation moved to `guides/features.md`, and `guides/README.md` lists every guide.
- Code cleanup with no change in behaviour: removed unused exports and an unused request logger, shared the duplicated canvas, record-check and ticket text-escaping helpers, dropped the redundant `@types/amqplib` (amqplib ships its own types) and declared `@sapphire/utilities`, which the bot already imported.
- Stricter handling of untrusted data: in-game chat messages, `CHAT_BRIDGE_ROUTES` and player directory rows are checked field by field instead of being read as untyped JSON. Route IDs written as JSON numbers are now rejected; write them as strings, because 18-digit numbers lose precision in JSON. The audit-log poller's timer no longer passes a promise where Discord.js expects a plain callback, and panels share one accent-colour helper.
- The release workflow starts only for CI runs on `main`, so pushes to pull requests and release branches no longer create a skipped release run.
- Release history starts at 2.0.0: database migration 2 deletes the stored changelog announcement records of 1.x and older releases. No other data is touched.

### Upgrading from 2.0.0

- Reinstall with `RELEASE_TAG` set to `v2.0.1` or `latest`. The new settings are optional.
- Database migration 2 runs on the first start and removes the changelog announcement records of 1.x releases. After it runs, 2.0.0 refuses to start against the database, so take a backup first if you might roll back.
- After the first start, check that the log shows `Global application commands synchronized` with no `50240` error, and that `/poker` appears in Discord.
- To get automatic updates, import the new egg (or change the startup command to `node scripts/updater/supervisor.mjs`) and follow `guides/automatic-updates.md`. Take a database backup first: a release with a database migration cannot be rolled back by the updater alone.
- For the changelog forum, create a forum channel, set `ANNOUNCEMENT_CHANNEL_ID` to it and give the bot View Channel, Send Messages (Create Posts), Send Messages in Threads, Read Message History, Attach Files, Embed Links and Manage Channels (for the tags). The new channel gets one post for each 2.0.x release of both apps, bot first; posts in the old channel are left as they are.
- Credential variables become hidden after re-importing the egg; a panel administrator must check them under **Admin → Servers → Startup**.

## [2.0.0] - 2026-11-25

### Highlights

- Built to stay stable in one busy server: separate database pools, batched archive writes, bounded caches, circuit breakers and cooldowns for slow services, and a bot that keeps running through PostgreSQL outages.
- Security hardening after a full audit: the bot serves only its allowed server, opens no network port, refuses redirects on credentialed requests, bounds upstream responses and never pings by default.
- New `/poker` launches Arrakis Hold'em, a play-money Texas Hold'em Discord Activity hosted by the dashboard, and new `/leaderboard` ranks players by Solari.
- Release announcements for the bot and the dashboard now come from the dashboard's changelog API, labelled by product, with the bot as the only Discord publisher.
- Every panel has a refreshed, consistent look, and published panels update in place.
- Releases ship as a checksummed source archive with a Node.js 24 Pterodactyl egg instead of a container image.

### Upgrading from 1.11.7

- Back up the PostgreSQL database and the server's `.env` first ([guides/operations.md](https://github.com/RealXKenny/Arrakis-Control-Bot/blob/main/guides/operations.md)).
- Import the new Pterodactyl egg, set `RELEASE_TAG` to `v2.0.0` or `latest`, and reinstall. The GHCR image is no longer published, so image-based servers must move their configuration to the new egg.
- Set `DASHBOARD_URL` to the HTTPS origin of a dashboard that serves `/api/v2/changelog`. Release announcements still require PostgreSQL.
- Optional settings: `ALLOWED_GUILD_IDS` (defaults to `GUILD_ID`), `DATABASE_POOL_MAX`, `DATABASE_BACKGROUND_POOL_MAX`, `DATABASE_STATEMENT_TIMEOUT_MS`, `RUNTIME_METRICS_INTERVAL_SECONDS`, `HEALTH_FILE` and `MESSAGE_ARCHIVE_RETENTION_DAYS` (off by default; deletions are permanent). See `.env.example`.
- For `/poker`, enable Activities on the bot's Discord application, map the root URL to the dashboard host, and set `POKER_ACTIVITY_ENABLED=true` on the dashboard ([guides/poker.md](https://github.com/RealXKenny/Arrakis-Control-Bot/blob/main/guides/poker.md)).
- On first start, migrations run once under an advisory lock and the bot refuses to start against a newer schema. Check that the `METRICS` log line reports `ready=yes`. To roll back, follow the runbook and restore the pre-upgrade backup.

### Added

- Runtime metrics: a one-line health summary every `RUNTIME_METRICS_INTERVAL_SECONDS` (default 60) with event-loop delay, memory, gateway ping, database reachability and pool pressure, archive buffer depth, Discord rate limits and open upstream circuits, plus warnings. Set `HEALTH_FILE` to also write it as JSON for container health checks. The bot still opens no port.
- Versioned database migrations: a `schema_migrations` table, ordered migrations applied once under an advisory lock, and a refusal to start against a schema from a newer release.
- Load and soak tests with latency budgets (`npm run test:load`, also run in CI), weekly grouped Dependabot updates, and an [operations runbook](https://github.com/RealXKenny/Arrakis-Control-Bot/blob/main/guides/operations.md) with backups, a restore drill, health signals and rollback steps.
- Add `/poker`, which opens Arrakis Hold'em, a play-money Texas Hold'em Discord Activity hosted by the Arrakis Control Dashboard, for up to four players with optional AI opponents. Chips are never Solari. The bot only launches the Activity; if Discord refuses, the member gets a private notice. Requires Activities and a URL mapping on the bot's application and `POKER_ACTIVITY_ENABLED=true` on the dashboard. See [guides/poker.md](https://github.com/RealXKenny/Arrakis-Control-Bot/blob/main/guides/poker.md).
- Add a deterministic export of dated bot release history for the dashboard (`scripts/sync-dashboard-changelog.mjs`), with format validation and protection against overwriting unrelated files. It is manual by design so a person reviews public notes; see [guides/changelog-synchronization.md](https://github.com/RealXKenny/Arrakis-Control-Bot/blob/main/guides/changelog-synchronization.md).
- Add `/leaderboard`, a public, paginated Solari leaderboard. It ranks players from the Dune Console player directory and per-player `solaris-coin` totals, keeps balances as decimal strings, caches the ranking for five minutes, and binds First/Previous/Next/Last controls to the requester for 15 minutes. It is listed in `/help` under Community & World.

### Changed

- Run as one shard by default (`TOTAL_SHARDS=1`); `auto` is still accepted. One server is always served by one shard.
- Interactions are acknowledged before slow work. Grouped-command role checks read the roles Discord sends with the interaction instead of a REST fetch, `/bot reload` defers first, and lookups that must run before a form opens (ticket, ticket review, player link, voice rename and limit) have a 2-second limit.
- Dune Console and hosting panel calls use a circuit breaker per API area (5 failures open it for 30 seconds), a concurrency limit with a bounded queue, and sharing of identical in-flight reads. `/server status` and storm map reads are cached for 10 to 15 seconds.
- Per-user cooldowns for commands that call slow services: 10 seconds for `/server status`, `/server vps`, `/player list`, `/player profile` and `/backup list`; 30 seconds for update checks; 60 seconds for backup create, import and download.
- Level, leaderboard, achievement and member cards encode their PNGs on a worker thread, and static panel banners are cached, so image work no longer blocks the gateway.
- PostgreSQL outages no longer stop the bot. Startup waits and retries with backoff, and a dropped connection during runtime is logged and replaced on the next query.
- Release announcements always post every new bot release before the dashboard, each product oldest to newest, so the newest release sits at the bottom of the channel and every run posts in the same order. Notes too long for one Discord message continue in up to four follow-up messages ("part 2 of 3") instead of being cut off; one receipt still covers the whole release, so nothing is reposted.
- Stability for one busy guild: separate interactive and background PostgreSQL pools with configurable sizes and statement timeouts (`DATABASE_POOL_MAX`, `DATABASE_BACKGROUND_POOL_MAX`, `DATABASE_STATEMENT_TIMEOUT_MS`); batch message-archive inserts with a bounded buffer that is flushed before edits, deletes and shutdown; skip XP database work inside the per-member cooldown; bound Discord message caches with a sweeper; and add optional archive retention (`MESSAGE_ARCHIVE_RETENTION_DAYS`, off by default).
- Align CI and release security with the dashboard: pin actions, verify merge-queue and V2 pushes, and validate checksummed source artifacts before granting the separate publish job write permissions.
- Replace the bot-specific GHCR image release and egg with a checksummed source archive and Node.js 24 Pterodactyl installer. Existing image-based installations must import the new egg and reinstall or migrate their configuration.
- Read release announcements from the dashboard's public changelog API instead of GitHub. Configure `DASHBOARD_URL` and deploy a dashboard with the API; stale, incomplete, or unavailable data pauses posting and replay. Existing PostgreSQL receipts remain in use.
- Move all changelog handling into `modules/changelog/` with one product registry. Each Discord post now states its product (Discord bot or Web dashboard) under the heading and uses a product-specific accent color, and the bot is the only Discord publisher for both products. Existing headings, receipts and history import are unchanged, so nothing is reposted. Release cards refresh to the new layout on the next panel refresh.
- Validate and bound dashboard release responses, apply HTTP timeouts and bounded caching, and label last-known-good data as stale. Preserve channel locks, durable announcement receipts, deleted-message records, and replay protections; there is no GitHub changelog fallback.
- Release automation checks the package and lockfile versions and attaches a versioned source archive with a SHA-256 checksum to each new release after successful main-branch CI.
- Redesign every Discord panel with a modern look: a shared indigo palette and semantic status colors (`panelStyle.ts`), sentence-case banner text, neutral wording instead of Dune-themed copy and emoji, and newly generated gradient artwork for all 31 images in `data/images/` (reproducible with `node scripts/generate-panel-artwork.mjs`). Image filenames, panel keys, custom IDs, command names, and the in-game bridge name are unchanged, so published panels refresh in place. The roles, rules, and bot-control headings changed; their previous headings are still recognized when importing history. Level cards, the leaderboard card, and announcement cards use the same palette. `createDuneBanner` is now `createPanelBanner`.
- Level role tier and achievement names are unchanged because they mirror existing server roles.

### Fixed

- Security: the bot now leaves any guild outside `ALLOWED_GUILD_IDS` (default `GUILD_ID`), but never leaves anything if none of the allowed guilds is present. Slash commands are registered for guild installs and guild contexts only.
- Security: reject `.` and `..` Dune Console route parameters, refuse redirects on credentialed and attachment requests, bound Dune Console, Discord Adapter and Convoy response sizes, restrict blueprint audit downloads to Discord's CDN, fail the `StaffOnly` precondition closed outside guilds, and default the client to `allowedMentions: { parse: [] }`. See [guides/security-audit.md](https://github.com/RealXKenny/Arrakis-Control-Bot/blob/main/guides/security-audit.md).
- Stop already-running shard processes when a later shard fails during manager startup.
- Bound the one-time release-announcement history import to 10,000 messages. If the limit is reached, stop without marking the import complete or posting announcements, rather than risking duplicates from an incomplete scan.

### Removed

- Remove the in-bot management dashboard work (OAuth, sessions, rate limits, framework bridge and gateway) before launch to reduce the attack surface. The bot no longer listens on any HTTP port and no longer depends on the Discord-Dashboard beta. The code remains in git history for a future, separately reviewed release. Release announcements still read the dashboard's public changelog API through `DASHBOARD_URL`.

### Verification

- Build, lint, typecheck, the full test suite, the load and soak tests, and the production dependency audit pass in CI on Node.js 24.
- Live Discord (including split release posts), PostgreSQL, Dune Console, the Pterodactyl install on Node.js 24, the poker Activity launch, and release publication were not verified before release.
