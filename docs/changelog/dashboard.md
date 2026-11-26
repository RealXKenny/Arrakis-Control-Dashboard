# Changelog

All notable changes to Arrakis Control Dashboard are documented here.

## [Unreleased]

## [2.0.1] - 2026-11-26

### Improvements

- Redis connection problems are now logged with their reason, such as `ECONNREFUSED`, `ETIMEDOUT` or `WRONGPASS`: one warning when the connection drops and one info line when it recovers, instead of silence. Warnings like "Community event announcements are temporarily unavailable" and "Population sample unavailable" now include that reason too. Connection strings are scrubbed from these messages.
- Starting the dashboard before a production build exists now stops with a clear message to run `npm run build` (or rebuild the Pterodactyl server) instead of a Next.js error.
- Dependency updates: Next.js 16.4.6, React 19.3.1, amqplib 2.4.2, and patch releases of Vitest, Playwright, Tailwind CSS, Prettier and the Next.js ESLint config.

### Fixes

- Automatic seasons now sort each member's generated objectives into the category the game tracks them in: XP and level goals under Levels, story under Story, contracts under Side quests, codex entries under Exploration, and other journey goals under Achievements. Before, all 100 sat under Achievements and the other cards read "0/0 No objectives configured". Categories a season does not use are hidden; Faction stays hidden because faction reputation is not verified game evidence.
- Season progress sync no longer stops for good with an `Unexpected token '<'` JSON error when a proxy or restarting server answers with a web page, a timeout or a rate limit. It explains what happened, shows the HTTP status, and retries automatically after 30 seconds, then 1, 2 and up to 5 minutes. Definite refusals, such as a missing linked character, still stop with their reason.
- Guild logos that are missing or fail to load now fall back to the guild's initials on the guild page and in the guild directory, even when the image failed before the page finished loading, instead of showing a broken image.

## [2.0.0] - 2026-11-25

### New Features

- Arrakis Hold'em: optional play-money Texas Hold'em that members open as a Discord Activity, launched from Discord or the bot's `/poker` command. Up to four players per lobby, with optional AI players for anyone who cannot find a second person. Chips are never Solaris. Off unless `POKER_ACTIVITY_ENABLED=true`.
- Separate Arrakeen and Harko Village pages show game map images with approximate linked-character markers.
- Arrakeen includes filterable, approximately aligned community location, service and contract markers with a keyboard-accessible list.
- Arrakeen uses category-specific map marker icons from the supplied atlas.
- Arrakeen and Harko Village maps can be dragged to pan and zoomed with the buttons or mouse wheel, like Hagga Basin.

- Harko Village now shows the Console's points of interest (vendors, CHOAM Exchange, Bank, Imperial Consulate, house representatives) as map markers and can place the linked character.
- Arrakeen community markers are re-aligned against the in-game map icons and measured positions, cutting the typical offset from about 8 m to about 4 m.
- Live maps can use a fresh, unambiguous inferred agent position for the linked character, falling back to Console positions when realtime data is unavailable.
- The portal's server rhythm panel can show seven days of observed aggregate population by local weekday and hour, including sample counts and missing-data states.
- Service status shows the active Console restart queue with server-adjusted countdowns and an explicit unavailable state. Daily and IP-change restart schedules are not included in that queue.
- Service status shows recent Console restart records when available, without treating restarts as confirmed incidents or inventing causes.
- Members with a separately configured backup-viewer role can see sanitized scheduled-system-backup status and database/system inventories. Archive presence is not proof of success or restore rehearsal; per-archive results and restore-rehearsal evidence remain unavailable.
- Service status includes an optional read-only report across 13 server, restart, population and backup capabilities, with permission, unsupported, outage and rate-limit states plus process-local stale last-success timestamps.
- A community calendar brings scheduled published events, verified personal guild signups and active queued restarts together in local-time agenda, week and month views; missing sources remain visible.
- Service status records seven days of sanitized health observations and separates observed degradation, outages and recovery from confirmed restart history. The actionable inbox adds scheduled-event and queued-restart categories with per-account notification controls.
- Community events support private registration and cancellation with bounded attendee seats and waiting lists, atomic last-seat protection and automatic promotion, plus own-status calendar and inbox context.
- Event galleries accept owner-managed evidence submissions with validated images, permission-aware review, and separately confirmed judging results under a dedicated event-reviewer Discord role.
- Player assistance adds categorized help requests, volunteer availability and atomic matching, full assignment lifecycles, private participant chat, abuse reporting and active-assignment inbox alerts.
- A least-privilege moderator workspace reviews direct player reports and assistance-abuse evidence snapshots with assignment, filtering/search, decisions, closure, bounded history and fresh moderator-role verification.
- Navigation reorganized: the More menu is gone. Everything now sits in the top row as categories (Assets, Bases, Guilds, Casino, Community and Personal), and every dropdown uses the same Bases-style panel with an introduction card and titled groups. Narrower desktop widths place the row on its own line instead of hiding destinations.
- Fleet tools on Vehicles: a maintenance inbox ranked by fuel and weakest component, private nicknames and tags, side-by-side component comparison, a trip cargo planner and a last-observed vehicle locator, all from permission-checked readings with unknowns kept explicit.
- Expeditions page: private map bookmarks, saved routes with straight-line planning estimates, a scouting journal, a Deep Desert departure checklist using the reported Coriolis cycle, and opt-in expiring rescue request cards shared by unlisted member links.
- Base upkeep tools at `/upkeep`: a base-care inbox with your own water and generator alert levels, observed water-usage charts with visible gaps, per-base stockpile minimums, private container aliases and zones, inspection checklists, recurring maintenance reminders, a private blueprint revision library with comparisons, and relocation checklists. Unknown readings stay unknown and nothing performs a game action.
- Universal item finder searches your authorized backpack, base containers and vehicle cargo with permission checks, and private pinned item counters track the stacks you care about.
- Storage adds a private equipment planner: saved harvesting, combat, building and exploration loadouts with readiness checks and resupply checklists, side-by-side gear comparison, a wear watchlist with your own thresholds, reusable inventory filters, storage suggestions from your container labels and verified free slots, and observed inventory-change history from snapshots you record.
- A private market planner adds grade-specific watchlists with price alerts and cooldowns, observed price charts, a shopping basket with listed-cost and shortfall estimates, project shopping lists compared with your storage, a budget check against your read-only Solaris balance, saved filters and recent searches, player-versus-broker prices, and completed-order activity and ownership-verified sales where the Console records them.
- Customizable portal widgets with a compact personal view, saved activity views for different activities, and a Console-default theme with 66 additional themes and a custom color studio.
- Unified actionable inbox for asset needs, supply follow-ups and operation briefings, with per-feature notification preferences, quiet hours, cooldowns and snooze controls.
- A private progression planner for your linked character: goals pinned to the portal, faction and Solari savings targets, skill builds compared with verified ranks, research and recipe checklists, pinned journey objectives, an opt-in observation journal, a notebook and a return-to-game briefing.
- Private personal tasks and goals linked to items, vehicles, bases and projects, and a privacy center for voluntary profile, location, crafting and supply sharing with revocable links.
- Mobile field quick actions, an authorized keyboard command palette (Ctrl or Command + K), and freshness and outage indicators with explicit last-success timestamps on monitoring panels.
- Personal data export and erasure controls for dashboard-owned notes, plans and retained snapshots.
- Guild projects and crafting: leader-defined construction budgets with milestones and responsible members, one-click shortage resource requests without duplicates, opt-in shared stockpiles with planning-only reservations, procurement assignments, a reviewed contribution journal with correction history, separate observed-estimate/manual/delivered cost summaries, an opt-in crafting directory and commission queue with requester-confirmed handover receipts.
- Private guild collaboration tools: noticeboard, operations planner with role sign-ups, resource requests with delivery tracking, shared base directory, recruit onboarding and guild polls with verified-character voting.
- Guild operations gain waitlists with explicit seat invitations, self-reported readiness cards, role-specific briefings, private waypoints linked to the live map, convoy plans and after-action reports with screenshots and reviewed follow-up tasks. A new Logistics tab adds recurring operation templates, a timezone-aware availability board, fleet dispatch bookings for owner-published vehicles with conflict checks, and Landsraad campaign targets linked to the objectives the server reports.
- Community seasons offer a 100-level reward track, server-verified progression and permanent profile cosmetics.
- Automatic seasons now use deterministic personal plans built from an immutable enrollment baseline. Objectives are based only on verified game data, never repeat or reroll, never complete instantly from existing progress, and report limitations instead of promising impossible completion. Level-200 characters receive journey objectives only.
- Eight rotating seasonal themes drive season names, subtitles, descriptions and reward focus without repeating inside a cycle.
- Catalog-backed reward economy: every one of the 100 levels carries a reward bundle of items, Solaris and House Credits generated from the Console item catalog within per-level, per-season and currency budgets. Developer, quest, entitlement-controlled and unclassified items are excluded and unsafe plans are rejected before publication.
- Manual **Claim Reward** and **Claim All Available** deliver rewards directly with no administrator approval: server-side level, ownership, character-binding and offline checks, durable component-level claim records, a persisted send marker before every game call, exact balance and receipt verification, and no resend of uncertain or interrupted deliveries. Claims remain open after a season ends.

- Simplified Console configuration: `DUNE_API_URL` and `DUNE_API_KEY` replace `CONSOLE_URL`, `CONSOLE_API_KEY` and `ADMIN_CONSOLE_API_KEY`, and `ADAPTER_TOKEN` is renamed `DUNE_ADAPTER_TOKEN` for the Console's Discord adapter, which accepts only its own token. Dashboard authorization, privileged HTTPS/loopback transport and the retired-setting startup error are unchanged in intent. Season automation and delivery toggles were removed.

- Added illustrated objective categories, completion summaries and filtering inspired by Icehunter/dune-admin, with preserved MIT attribution and original vector artwork.

- Private guild polls: leader-published single-choice questions, local closing times, current-character voting, vote changes/withdrawals, aggregate results and early closure. Immutable published choices, atomic revisions, commit-time deadlines, bounded retention and disband cleanup protect voting without exposing voter identities in member views.

- Recruit onboarding: private guild welcome guides, rules acknowledgments, useful locations, mentor assignments and per-character checklist progress. Verified leaders review progress; changed rules/items require fresh acknowledgment/completion, with bounded storage, revision protection, retained drafts and disband cleanup.

- Shared guild base directory: members can search private locations and filter by map, purpose and archive status; verified leaders maintain contact details, access instructions and notes. Bounded storage, revision conflicts, retained drafts and disband cleanup protect coordination without changing in-game permissions or publishing blueprints.

- Guild resource requests: members can request materials, pledge exact quantities and report deliveries; requesters or leaders confirm receipt separately. Private views, partial-delivery tracking, quotas, revision conflicts and retained drafts protect coordination without moving items or currency automatically.

- Guild operations planner: leaders can schedule runs with meeting points and role capacities, while members can join, switch roles or withdraw before the start. Local-time schedules, private team lists, conflict protection, draft preservation and leader cancellation/completion controls keep guild plans organized.

- Guild noticeboard: current members can read a private daily message, priorities and pinned announcements on My guild. Freshly verified leaders can create, edit and remove posts, with conflict protection and drafts preserved after failed saves.

- New Service status page embeds the HetrixTools hosting availability report with automatic sizing and a direct-report fallback. It requires sign-in.
- New Community events page brings competitions, prize pools, schedules, entry instructions and rules together. Members can filter upcoming, current and past events; dates display in their own timezone.
- The first Base Building Competition offers 500,000 Solaris coins and a couple of new in-game items. Dates, specific item prizes and entry or judging details remain to be announced; prize listings do not award currency or items automatically.
- Arrakis Control has been rebuilt from the ground up as version 2 with a new "Modern Dune" look: deep obsidian backgrounds, muted desert-sand panels, Spice Melange amber for actions and active states, sharp corners and flat, hard shadows.
- New landing page with a custom dune-ridge identity, a responsive hero, feature illustrations and dedicated sections for players, communities and server operators. The header has a circular V2 badge; the simplified footer shows the brand and Funcom disclaimer without a version badge.
- New Market grid: a strict 5 × 5 board with 25 listings per page, search, sorting and a My listings filter. The old intelligence and buyback modules have been removed.
- New Vehicles page: the Owned / Shared switcher only appears when you have both, and disappears entirely when you have no access. Container vehicles (BP_ContainerVehicle) show cargo capacity and no longer show a fuel bar.
- New Base Marketplace: upload your own base layouts (JSON up to 2 MiB) with a title, description and required front picture, then browse, search and filter what the community has shared by map. Each base has a detail page with its pieces, a layout download and Import to my character. Owners can change the picture without changing the listing's position, or remove their listings.
- New Holdings page with runtime, water and storage gauges for every owned and shared base, blueprint download and a full-screen 3D preview.
- New Storage page: search your inventory, filter by container and switch between a grid and a list.
- New Overview page with live field conditions for Hagga Basin and the Deep Desert, the Coriolis countdown, exchange totals, a 24-hour server population chart and the Landsraad balance of power.
- New Character page with vitals, faction standing, specializations, journey progress and equipped gear.
- Guilds and My Guild have been rebuilt: browse recruiting guilds, apply with the guild's own questions, chat privately with reviewers, manage your roster and ranks, edit joining requirements, upload a logo and review applications. Application questions support short text, paragraphs, dropdowns, timezones, checkboxes and decimal-number answers.
- The Live Map now has its own page for Hagga Basin and the Deep Desert, with 2D and 3D views, searchable markers, bases, vehicles, and an optional realtime layer for online players and world objects. A 2D fallback remains available when WebGL2 is unavailable.
- Optional automatic announcement of each newly deployed release, sent once even when several servers start together.
- New public Changelog page that the announcement buttons link to, plus machine-readable release snapshots at `/api/v2/changelog` and the latest-release endpoint. Dashboard announcements link directly to that published release history.
- You can now sign in with your email and a password as well as with Discord. Choose a password after your first Discord sign-in. Sessions stay open for 30 days.
- Times are now shown in your own timezone and language, for example `Nov 7, 2026, 11:19 PM EST`, with daylight saving handled for you. Hover a time to see the full local and UTC readings. This covers the Overview "Last reading", base publish dates, guild chat and application times. Countdowns such as the Coriolis cycle and the Landsraad term still count down as durations.
- The Changelog page and the release announcements understand the grouped Patch Notes format (New Features, Improvements, Fixes and so on).
- Optional Live Chat connects the dashboard to Dune: Awakening through the existing bot-compatible game chat protocol. Choose a configured destination, read incoming player messages and send messages from your authenticated dashboard account without refreshing the page.
- Live Chat combines game, dashboard and verified Discord-relay messages in one chronological conversation. Discord relays show the relayed sender's name and a Discord-blue badge; genuine player messages keep the Game badge, even when their text imitates a Discord prefix.
- Chat history is stored in Redis Streams, with 50-message initial pages, older-message pagination, and configurable defaults of seven days and 10,000 messages per destination. Redis Pub/Sub and authenticated Server-Sent Events provide live updates and missed-message recovery.
- The standard Node.js/Pterodactyl launcher automatically starts and supervises the Chat Bridge when chat is enabled. Incoming game messages are consumed before anyone opens Live Chat, and the worker exposes local health, readiness and non-content metrics endpoints.
- RabbitMQ TLS accepts complete PEM certificates directly in `.env`, including multiline values and escaped newlines. Optional client certificates and private keys support mutual TLS; existing certificate-file settings remain supported.
- Discord profile pictures are now stored as image bytes in Redis and served through authenticated dashboard URLs across navigation, profiles and chat. Browsers no longer load pictures from Discord's CDN; missing pictures are fetched by the server and saved before being served.
- The Solaris Exchange adds a Dune-themed casino lobby, wallet, round history, fairness tools, rules. Its six game modules are The Emperor's Hand (Blackjack), The Spice Wheel (Roulette), Fate of Arrakis (Dice), Spice Harvest (Mines), Ornithopter Run (Crash) and The Great Houses (Coin Flip).
- Casino wagers use real in-game Solaris through a Redis-backed wallet, with exact-integer balances, reserved wagers, idempotent settlement, committed server seeds and configurable wager and payout ceilings. Deposits, withdrawals and wagering remain disabled by default; live money movement requires deployment-specific verification before enabling it.

### Community Contributions

- The appearance studio includes 66 theme choices from PR #298, with its upstream MIT credit and separate swatch-data terms preserved.
- Illustrated season objective categories and vector artwork were inspired by Icehunter/dune-admin and retain the upstream MIT attribution.
- Restart, health and backup integrations use Red-Blink's Dune Console API documentation and structured response contracts; unsupported evidence remains explicitly unavailable.

### Improvements

- Live maps have separate navigation destinations and a legend that follows the layers present in each reading.
- `npm run env:migrate` updates an existing `.env` automatically: it renames replaced variables, removes retired ones, appends new ones as commented placeholders, keeps a timestamped backup and never prints values. It also runs before `npm run dev` and `npm start`.
- Console configuration simplified to `DUNE_API_URL`, `DUNE_API_KEY` and `DUNE_ADAPTER_TOKEN`, replacing `CONSOLE_URL`, `CONSOLE_API_KEY`, `ADMIN_CONSOLE_API_KEY` and `ADAPTER_TOKEN`. Production refuses to start on the retired names without replacements. The Pterodactyl egg exposes the new variables as hidden secrets.
- Console-style desktop and mobile polish with shared button, card, menu and control helpers used across seasons and personalization.
- Redis integration and Cluster recovery coverage expanded, including baseline, claim and delivery records on real standalone and six-node Cluster targets.
- All coding-agent guidance now lives in one `AGENTS.md`; the per-tool rule folders and companion files were removed.
- Component, accessibility and responsive coverage expanded across Chromium, Safari, iPhone and Android projects.

- Redis Cluster verification runs on V2 pushes using three masters and three replicas, retaining test logs and final topology. Expanded real-Redis coverage exercises transfer concurrency, uncertainty/reconciliation, multi-page recovery and interrupted round settlement after reconnecting. Cluster pool connections no longer inherit a standalone database selection, and pool shutdown now closes every connection.

- Final release-audit coverage checks 25 member routes at six desktop/tablet/mobile widths, WCAG 2.0/2.1/2.2 AA automation, keyboard navigation and reduced motion. Improved small-screen base upload and fairness forms, readable secondary text, loading announcements and unavailable gauge semantics. Added sanitized production-build screenshots for the landing page, overview, casino, Blackjack, sound settings and navigation.

- Signed-in visitors now see Open dashboard actions instead of Discord sign-in prompts. Signed-out topbars show only the brand and Sign in, including mobile.
- Discord release and progress announcements now use the main bot token and Components V2 containers instead of webhooks. Published community events announce automatically, update their existing posts, and report pending or uncertain outcomes accurately.
- Large changelog announcements split complete notes and categories across numbered Discord messages instead of silently clipping the release. Oversized individual notes continue across parts, announcements exceeding the 50-message limit are rejected before sending.
- Event announcements recover known failures through a non-overlapping background scan. Unpublishing replaces an existing announcement with a withdrawn notice without exposing private draft changes; event saves remain separate from Discord delivery outcomes.
- Shared Discord announcement tracking uses Redis leases and persisted send intent. Unchanged messages are not reposted, rate limits back off, and an uncertain first creation is not blindly retried after a timeout or restart.
- Console logs now use aligned severity and service columns, distinct Redis and Chat Bridge colors, and readable metadata rows instead of inline JSON. Audit console entries share that style, with clear sign-in/sign-out messages, colored outcomes and correlation IDs. Secret filtering and structured Redis audit records are preserved; console log shippers must adapt to the readable format.
- Chat Bridge status is now one concise line: idle connections say they are waiting for messages; active summaries show received and saved totals, with exceptional counters only when present. Identical summaries stay quiet, outages and backpressure produce warnings, and full diagnostics remain available at DEBUG and the metrics endpoint.
- Repeated Redis pool connection setup is now DEBUG-only, keeping routine startup output shorter. Setting `NO_COLOR` disables ANSI colors, and redirected startup output is no longer cleared like an interactive terminal.
- The public Changelog now has a wider release journal, category cards, counts, search across all notes, category filters and expandable previews. Inline code and emphasis remain safely rendered as text-based React elements.
- Existing signed-in sessions now fetch missing Discord server nicknames automatically, without signing out. Failed optional profile refreshes back off for five minutes; normal authorization checks and session revocation remain enforced.
- The landing page now uses local dashboard, map and guild illustrations instead of presenting sample telemetry as live data. Feature descriptions link to their dashboard pages, and the hero and closing actions follow the current session.
- Pages are now rendered on the server and shared data is cached briefly, so many members opening the same page cost one request to the game server instead of many.
- Read limits protect the dashboard: 120 reads per minute per connection and 2,400 per minute overall (adjustable with `API_GLOBAL_READ_LIMIT`).
- Prices, stock and other very large numbers are kept exact and formatted only when they are shown.
- Search, sorting, filters and paging on the Market, Base Marketplace and Storage pages live in the address bar, so every view can be bookmarked and shared.
- Better accessibility: a skip-to-content link, keyboard-friendly navigation, readable gauge values for screen readers and every animation switched off when your system asks for reduced motion.
- Redis now uses ioredis and can run on a Redis Cluster by setting `REDIS_CLUSTER_NODES`. All multi-key storage operations use hash-tagged keys so they work on a cluster.
- Link previews for the dashboard now come from the page metadata, using your public `APP_URL`.
- Release notes use the new Patch Notes format, and the release workflow publishes the section that matches the package version.
- Signed-in pages now use up to 1,600 pixels of width instead of a narrow centred column, and the Overview is a responsive grid: spice conditions and your character, the four summary cards, then server population and the Landsraad. Summary numbers line up in columns and small labels were enlarged for readability.
- The spice conditions card now shows the Coriolis countdown and the last reading as two clear figures, and the Server rhythm card says in words when nobody was online instead of drawing a flat line.
- The footer is now just the Arrakis Control mark and "Fan-made. Not affiliated with Funcom." with no links.
- The code is now organised by feature (`src/features/…`) with shared pieces in `src/components`, `src/server` and `src/lib`, and automated tests enforce the layout, the browser/server boundary and the root-file list. The guides for this are in `docs/architecture/`.
- Many more automated tests now cover the market, vehicles, sign-in, client addresses, Redis Cluster behaviour and session re-checks.
- Live Chat uses a responsive message layout with your messages on the left and other senders on the right. Dashboard account IDs determine dashboard authorship. Game, Discord-relay and legacy messages are grouped visually using your linked character name and Discord username, display name or server nickname; name matches affect presentation only and never authorize account operations. Profile photos, source badges, date separators, timestamps and a clearer composer make conversations easier to follow on desktop and mobile.
- Chat keeps your place when older history is loaded, offers a jump to new messages when you have scrolled up, and bounds the messages retained by a long-running browser tab. Destination switches discard stale history, sends and subscriptions from the previous destination.
- Public chat publication status now reads `Sent`, `Sending`, `Not sent` or `Unconfirmed`, with infrastructure names kept out of the page. Sent means the submission was accepted; it does not claim that the game displayed it.
- Confirmed chat publish failures receive up to three total attempts with short delays and one stable message ID. After the final failure, the message leaves the shared conversation and appears only to its sender in a private `Not sent` notice with a `Dismiss message` button.
- RabbitMQ publisher connections and channels are reused. Broker and worker recovery use bounded backoff, restore consumer bindings after reconnecting, and shut down with the dashboard on SIGINT or SIGTERM.
- The dashboard consumer uses its own broker-generated exclusive queue, matching the existing game broker's permissions without competing with the Discord bot or requiring named dead-letter exchanges. Queue count, message age, prefetch and processing retries are bounded.
- Discord avatar storage uses a Cluster-compatible, bounded cache of up to 512 images, least-recently-used eviction and a 30-day inactivity expiry. Retained images remain available during Discord outages, and avatar hash changes select a new image automatically after account re-verification.
- Marketplace ownership now supports HMAC-based owner keys, with a migration tool for older listings. Publishing, deletion, storage accounting and quota checks are atomic in Redis.
- Full-screen base previews and map models share their building catalogue, terrain and native transforms, including material layers and pentashield coverage. Rendering is limited to nearby models, with disposal when views or selections change.
- Documentation is consolidated under `docs/`, covering setup, configuration, features, APIs, integrations, security, operations, migration and troubleshooting. Repository inventories, placement rules and AI-tool adapters share one authoritative project contract.
- GitHub Actions now validates quality, documentation, assistant configuration, workflow security and dependencies. Browser verification runs across four CI shards, production smoke runs alongside it, and separate disposable Redis suites cover standalone and Cluster behaviour.
- Release automation requires successful CI for a stable version already on `main`. It publishes the exact source archive, a SHA-256 checksum and a Pterodactyl egg; the installer validates the archive and fails closed on missing or invalid integrity information by default.
- Solaris transfers require a fresh linked-character check and an offline character. A Console adjustment must confirm the exact currency, amount, offline state and expected resulting balance before wallet settlement; unclear outcomes are quarantined rather than automatically retried. Recovery handles interrupted reservations and round settlement without granting duplicate balance.

### Fixes

- Participant counts in season totals now start at a member's first recorded activity instead of when tracking creates an empty record.
- Existing character levels and completed journeys no longer complete a new season immediately.
- Inventory readings reset when the account context changes, tablet actions wrap, viewed chat receipts are verified, and command navigation stays inside desktop breakpoint bounds.
- Base upload grids and labels no longer overflow on narrow screens, and the storage grid fits phone screens.
- Seven-tab guild navigation fits its width and season browser fixtures are isolated across CI shards and retries.

- Changelog counters distinguish release updates from their individual changes, so version 2 is shown as one update. Selected text uses a visible blue highlight for copying.
- Restored the shared Obsidian, Sand and Spice CSS color variables so primary buttons, focus rings and feature styles consistently resolve their intended colors.
- Header controls and branding now adapt to narrow screens while retaining usable touch targets. Navigation adapts to narrow screens without horizontal overflow.
- Fixed Redis Cluster node lists written with IPv6 addresses being read with the wrong host and port.
- A Discord outage or rate limit while re-checking a password login is no longer treated as a revoked Discord connection.
- The Market loading grid now scrolls inside the mobile workspace instead of pushing the whole page wider than the screen.
- Chat delivery updates no longer try to append an existing Redis Stream ID. Separate expiring delivery-state records are overlaid on history, so a state change cannot collide with a stored message or leave it permanently pending.
- Browser network failures and lost publish confirmations now remain `Unconfirmed`, rather than being reported as a definite failure. Uncertain sends are never retried automatically; a deliberate status check reuses the original idempotency key.
- Retried or concurrent requests for the same chat message no longer start another publish sequence. Redelivered incoming events are deduplicated atomically before live notification.
- SSE reconciliation refreshes unresolved delivery states, protects against stale events overwriting newer states, subscribes before loading history and cleans up listeners when clients leave. Streams remain the durable recovery source when Pub/Sub notifications are missed.
- Invalid, expired or cross-destination Stream records are rejected on history and reconciliation reads, while pagination cursors still advance past them. Late events from a previous destination cannot leak into the newly selected conversation.
- The receive worker no longer fails while attempting to declare a custom dead-letter exchange that the existing game broker does not permit. Its outgoing envelope, exact case-sensitive routing keys and AMQP properties remain compatible with the reference bot.
- Authenticated profile images now use a consistent initials fallback if Redis storage or image loading is unavailable, instead of leaving a broken image in navigation, profiles or chat.

### Security

- Only the poker Activity page may be framed, and only by Discord; every other page stays unframeable. Activity sign-in verifies the member role and the Activity instance with Discord.
- Season progress, claims and deliveries are bound to canonical pawn and controller IDs, use atomic CAS records, and never accept client-supplied evidence, amounts or recipients.
- The Discord adapter token is separate from the Console API key, and privileged Console transport requires HTTPS or loopback.
- Moderator, event-reviewer and backup-viewer roles are independently verified against current Discord guild membership and fail closed. Case evidence, event judging and backup evidence never inherit guild-leader, administrator or each other's permissions.

- Members who leave the Discord server or lose the required role are now signed out within 30 minutes. If Discord cannot be reached, a session stays valid for up to 6 hours after its last successful check.
- Password sign-in re-checks the Discord guild and role every time. Passwords are hashed with scrypt, Discord refresh tokens are encrypted before they are stored, and only a Discord-verified email can be linked to an account.
- Password sign-in is limited per email, per connection and per email-and-connection pair.
- Rate limits now trust only the address your reverse proxy appended to `X-Forwarded-For`, so a forged header can no longer pick a different limit bucket. Set `TRUSTED_PROXY_COUNT` to the number of proxies in front of the dashboard (default 1, use 0 when exposed directly).
- Uploads are counted while they stream in, pictures are identified by their contents rather than their file name, and every new change request checks that it comes from the dashboard itself.
- Discord announcement requests disable automatic mentions, use a fixed HTTPS Discord API origin, refuse redirects and verify that configured channels belong to the dashboard's Discord guild. Bot tokens and raw provider errors never enter the browser or announcement previews.
- Guild settings, roster changes and application decisions require freshly verified linked-character leadership. Review leases, generation checks and idempotency protect concurrent decisions and reapplications; private conversations remain restricted to their intended participants.
- Chat history, send and SSE endpoints independently require a session and a configured destination. Sends enforce same-origin checks, bounded text and per-member and per-destination rate limits; chat content is rendered as text.
- RabbitMQ certificate-chain and hostname verification remain enabled. Inline PEM takes precedence over file paths; malformed certificates, incomplete client identities and incompatible keys fail safely without logging certificate contents, private keys, passwords or credential-bearing connection URLs.
- Avatar downloads use a fixed HTTPS Discord endpoint with no redirects, no forwarded session credentials, a five-second timeout, strict PNG checks and bounded image sizes. Authenticated cache misses have per-member and deployment-wide limits, and concurrent downloads are capped.
- The browser Content Security Policy no longer allows Discord's CDN as an image origin. Profile image responses are private, no-store, protected by `nosniff` and restricted to same-origin use.
- Security audit events are redacted and bounded, and session indexes support revocation without exposing raw session tokens. Workflow permissions, action pins and release-source checks limit privileged automation to trusted release paths.
- Casino routes derive wallet ownership from the session and keep unrevealed game state on the server. Uncertain currency adjustments are never automatically repeated, and uncertain transfers are quarantined.
- Startup warns when `DUNE_API_URL` uses plain HTTP on a public host, because the Console API key would travel unencrypted. Poker Activity sign-in is limited per Activity as well as per address, so players behind Discord's proxy do not share one small budget. The 2026-11-26 launch audit is in `docs/security/audit-2026-11-26.md`.

### Privacy

- Marketplace ownership uses an opaque publisher key rather than exposing the account ID as the listing's owner key.
- Your email address stays on the server and is never sent to your browser.
- Loading a profile picture no longer connects the member's browser directly to Discord's CDN. The dashboard server downloads a missing image once for its cache and serves subsequent requests from Redis while it remains retained.
- Pending, failed and uncertain dashboard chat payloads are excluded from shared history and SSE. Final failures remain local to the sender's open conversation; dismissing a notice does not send a deletion or retry request. Bounded internal records remain for idempotency and reconciliation.
- Chat operational logs, health checks and metrics omit message bodies and broker credentials. Inline TLS private keys are never written to temporary certificate files.
- Community event drafts are excluded from member pages and read APIs. The Discord bot token stays server-side.

### Removed

- The dashboard no longer posts changelogs to Discord; the Arrakis Control bot is the only changelog publisher and reads `/api/v2/changelog`. `CHANGELOG_CHANNEL_ID` and `CHANGELOG_AUTO_ANNOUNCE` were removed. Community event announcements are unchanged.
- The Overland map page, navigation entry and image: the Console reports neither points of interest nor a live position for it.
- The administrator workspace, administrator APIs, associated configuration and manual reconciliation interfaces. Scoped server-side workers handle recovery and quarantine uncertain outcomes.
- The tool-specific project guide and its validation; shared coding-agent instructions live in `AGENTS.md`.
- The More navigation menu, the per-tool agent rule folders (Cursor, Windsurf, Cline, Roo, Continue, Codex, Copilot), the Codex, Kimi and Gemini companion files and the retired `CONSOLE_*`, `ADMIN_CONSOLE_API_KEY` and `ADAPTER_TOKEN` variables.

- Root Docker build, Compose and ignore files, container entrypoint scripts and the custom application image. Releases use the standard Pterodactyl Node.js runtime, and optional chat starts through the existing Node.js launcher without an additional required process manager.
- The second navigation row that used to sit under the top bar.
- Seasonal calendar themes and the Announcify announcement widget.
- The Discord link-preview card module, replaced by standard page metadata.
- The single-page portal with its `?view=` switcher, replaced by separate pages with their own addresses.
- Technical broker names and routing keys have been removed from the public chat presentation, and failed sends no longer remain as shared conversation entries or offer an automatic resend action.
- Changelog webhook delivery and its URL setting have been replaced by the shared Discord bot token and configured channel IDs. Existing webhook-owned posts are not claimed or edited by the bot.
- Casino demo credits and refill flows have been removed; the Exchange uses real Solaris and its explicit server-side enablement gate.

### Upgrade Notes

- Set `MODERATOR_DISCORD_ROLE_IDS` only for the moderator case workspace and `EVENT_REVIEWER_DISCORD_ROLE_IDS` separately for event-submission review and judging. Each requires current Discord guild-role verification and grants no other privileges.
- Set `BACKUP_VIEWER_DISCORD_ROLE_IDS` to the separate Discord roles permitted to view backup status, and grant the Console key the `backups:read` scope. The configured Discord bot must be able to read guild members.
- Set `AUTH_SECRET` to at least 32 random characters. It is required in production.
- In the Discord developer portal, change the OAuth2 redirect URI to `<APP_URL>/api/auth/callback/discord`.
- With the dashboard stopped, run `npm run redis:rekey` for a dry run and `npm run redis:rekey -- --apply` to rename existing Redis keys, then start version 2. Move data to a cluster only afterwards.
- Everyone is asked to sign in again once after the upgrade.
- To enable Discord announcements, set the server-only `DISCORD_BOT_TOKEN`, `CHANGELOG_CHANNEL_ID` and `COMMUNITY_EVENTS_CHANNEL_ID`. The existing main bot can be reused; no additional bot process or Gateway session is required. Remove the obsolete `CHANGELOG_WEBHOOK_URL` setting. Optionally set `CHANGELOG_AUTO_ANNOUNCE=true`; its first run records the current release as a baseline rather than replaying old releases.
- Give the bot View Channel, Send Messages and Read Message History in the configured text or announcement channels. Both channels must belong to `DISCORD_GUILD_ID`; a public HTTPS `APP_URL` supplies announcement links. Keep the token out of Git and logs and enter it through the hidden secret setting when using the Pterodactyl egg.
- Every stable release now attaches a ready-made Pterodactyl egg (`egg-arrakis-control-dashboard.json`) to its GitHub Release. The egg downloads the latest release and builds it in `/home/container`; the host supplies `SERVER_PORT`.
- Use Node.js 22 or newer. Build with `npm run build` and start with `npm start`; `npm run dev` retains the development launcher. Docker is not required.
- Keep `OWNER_KEY_SECRET` stable and separate from other credentials before retaining published marketplace listings. Review `npm run marketplace:rekey` and the migration guide before changing existing owner keys; legacy keys remain accepted until migrated.
- To enable Live Chat, configure `CHAT_ENABLED=true`, `RABBITMQ_URL`, `CHAT_BRIDGE_FUNCOM_ID` and `CHAT_SERVERS` with exact case-sensitive map keys. The launcher starts the worker automatically; `npm run chat:bridge` is a standalone diagnostic command and must not run beside that supervised worker.
- The chat broker account needs the existing `chat.map` exchange and permissions for broker-generated `amq.gen-*` queues, bindings and publishes. `CHAT_BRIDGE_QUEUE` is retained only for compatibility and is ignored; no named dashboard dead-letter resources need to be created.
- For RabbitMQ TLS, use `amqps://` with inline `RABBITMQ_TLS_CA`, optional paired `RABBITMQ_TLS_CERT` and `RABBITMQ_TLS_KEY`, or their `_PATH` alternatives. `RABBITMQ_CA_FILE` remains a legacy CA-file fallback. Trust the issuing CA, or an explicitly trusted self-signed server certificate; a server certificate is not a client identity. Use a hostname matching the certificate and keep verification enabled.
- Set `CHAT_DISCORD_BOT_FUNCOM_ID` only to the trusted relay bot's exact Funcom ID to enable Discord attribution. Quote environment values containing `#`. Redis supplies the existing avatar cache automatically; no image directory or new avatar environment settings are required.
- Existing Redis chat history survives dashboard restarts while retained, but the exclusive RabbitMQ receive queue does not collect an offline backlog. Messages sent while no dashboard consumer is connected cannot be recovered from Redis unless they were previously persisted. Publisher confirmation is not proof of in-game delivery.
- Community events initialize the first competition once per Redis store and retain edits across restarts. Published events are considered for automatic Discord announcements at startup and after saves; configure the bot and channel before enabling this behavior in production.
- Keep `CASINO_SOLARIS_ENABLED=false` until the transfer and reconciliation workflow has been independently verified for your deployment. Review `CASINO_MAX_WAGER` and `CASINO_MAX_PAYOUT` before enabling real wagers; there is no demo-money fallback.
- These notes describe the implemented code, not a claim that every integration is production-verified. Live game delivery, disposable standalone/Cluster Redis scripts, Discord channel permissions and real Solaris transfers require their respective infrastructure checks. See the feature and progress guides under `docs/` for remaining limitations.

## [1.20.6] - 2026-11-05

### Added

- Confirmation dialogs now open centred and lay out their typed-phrase prompt on one line (found while recording showcase footage); a test guards the position.
- Statistics screen under Control center: a readings table with value, status (available / not reported / source failed / not configured), source and freshness, session-only trends, market and Discord-adapter statistics with their own sources, and explicit limits (no per-player metrics, event history or long-term trends).
- Accessibility and visual pass on the administration screens: pillbox-styled buttons and visible focus rings for every manager control, underlined accent links, short row-action labels with full accessible names, dialog focus returned to the opener, and a regression test for overflow at desktop/tablet/mobile, unnamed controls and dialog focus.
- Dedicated Live map screen (capabilities, explicit map and partition selection that never starts a map, player/base/storage/service/marker/spice/POI layers with links to management records, partition-scoped player teleport with confirmation).
- Dedicated Guild membership screen (guild directory, roster with ranks, promote/demote/make-leader/remove/add with explicit confirmations, disband with cleanup warning), Discord integrations screen (adapter health/version/readiness/services/ports, population and activity, capability catalog, honest not-configured and denied-scope states, restricted adapter writes listed as unavailable) and Public directory status screen with a Console handoff for editing and claiming. Fixed guild rows being labelled generically.
- Dedicated Updates screen (game and stack update checks that only look, automatic-update settings) and Addons screen (installed and community lists, bounded addon file inspection) with an explicit Console handoff for every restricted apply, repair, install, enable, disable and removal.
- Dedicated Care packages screen (capabilities, enable/disable and scan with Console phrases, eligible players, grants/history) and Admin tools screen (broadcast and map chat, item/vehicle/skill-module catalogs, Landsraad overview and task goals, message of the day/announcement/transfer settings with restore-defaults, administrator history). Grants and other writes whose confirmation wording is undocumented stay in the full forms.
- Dedicated Server screen (status, guarded start/stop/restart and per-service restart, shutdown protection, readiness/ports/doctor with repairs and cleanup, restart schedule and countdown cancel/restart-now, IP-change restart, title, write-only Funcom token) and Logs screen (service selection, bounded sanitized output, download, SSE live stream with stop/reconnect and a 64 KiB tail). The Console records no administrator command history, so none is shown.
- Dedicated Market screen (statistics, items, time/trader-filtered transactions, read-only probe versus confirmed buyback/seed runs, sweep log, safety-backup toggle with the Console phrase, seed-plan activation/rename/CSV export, seller and blacklist configuration).
- Dedicated Backups screen (game backups, encrypted system backups with required preview before an explicit apply, passphrases never retained, automatic schedule) and Maps & worlds dashboard (maps/status, memory and scaling, settings and pending restarts, Deep Desert/Sietches/spicefields/terminals).
- Dedicated Bases & storage screen (base detail with generators/water maintenance, auto-refill enrollment and settings, access, export, deletion; storage container directory with item adds and export; pending-queue cancellation) plus Players and Vehicles administration screens: searchable paginated lists, URL-preserved detail views (profile, inventory, progression, moderation, cargo, access, pending deletions) and accessible confirmation dialogs; the generic API forms stay available under Advanced tools.
- Grouped administration navigation (six sections, tabs, breadcrumbs, URL/back-forward state, shared `PillNav`), a Console-only handoff screen, and an operation coverage matrix in the generated API report.
- Added an admin control-center overview with API-backed server health, CPU/memory, player/guild/base/vehicle/map/backup statistics, service status, session trends, and per-source response times. Added Setup & connections diagnostics, a searchable complete API reference, and operation purpose/credential/behavior guides. Missing data and scope failures remain visible without hiding successful readings.

- Added persistent unread admin-message badges to My Guild and unread leader-reply badges to administration, Guild oversight, and individual guilds. Counts clear only when the relevant support messages are viewed.

- Expanded administration into grouped tools with labeled request forms, filterable/paginated results, and contextual player, guild, base, and vehicle actions. Added guild oversight, administrator member/rank/disband controls, read-only application conversation inspection, and private administrator–guild leader support chats in My Guild Settings.

- Added a Guilds page in Community where members can browse guild recruitment listings and joining details. Leader settings stay under My Guild.
- Added leader-only Guild settings to edit joining requirements and contact details, and publish or unlist a guild.
- Accepting an application now adds the applicant’s verified linked character to the guild as a Member. Failed joins keep the previous application status; Console enforces guild capacity, faction compatibility, and existing membership.
- Guild listings now show their saved logos and offer a joining application form. Applicants can check their application status; guild leaders can review, accept, decline, and remove applications in My Guild → Settings.
- Guild leaders can add required or optional application questions. Submitted answers keep their original question wording. Applicants and the current guild leader can exchange private live chat messages from the application and review inbox.
- Application forms are now built entirely by the guild owner, with no preset fields. Questions support short answers, paragraphs, dropdown choices, time-zone dropdowns, checkboxes, and numbers. Existing submissions retain their original answers.
- Guild leaders can manage members beside each name: promote Members to Officers, demote Officers, confirm leadership transfers, and remove members. Added member invitations and a typed-confirmation disband action in Settings. Every change rechecks current leadership and member ranks; disbanding also clears saved recruitment data.

### Removed

- Clerk sign-in. Discord OAuth is the only sign-in: the `/sign-in` page, the `/auth/complete` bridge, the Clerk middleware, `AUTH_PROVIDER`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and the `@clerk/nextjs` dependency are gone, and `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are always required in production.

### Changed

- Existing applications show Check status and Chat with reviewer on guild cards, with a persistent unread reply badge that clears when messages are viewed.

- Refreshed Guilds listings with larger logo tiles, recruiting badges, compact requirement previews, question counts, and aligned actions. Details and applications expand across the row for easier reading on desktop and mobile.

### Security

- Guild settings and logo changes verify the linked character’s guild leadership by character ID. Matching character names cannot authorize edits.

### Fixed

- Moved the image cache into Pterodactyl’s writable server storage and prepare it before startup, preventing image cache directory errors on containers with a read-only application filesystem.
- Guild leader settings now verify both linked pawn and controller IDs instead of relying on a cached single ID. Settings visibility uses the same server-verified permission as saving changes.

## [1.20.5] - 2026-11-05

### Added

- Added an optional Clerk sign-in. Members still sign in with Discord, and the dashboard still checks that they belong to the community and have the required role. Signing out also ends the Clerk session.
- Added more Choam and Harkonnen building pieces to base previews, with their matching surface textures.
- Expanded base previews with additional Atreides, CHOAM, and Desert Mechanic building pieces.
- Added more detailed vertical and horizontal pentashield shapes to base previews.
- Restored separate glass panes in supported windows and replaced the unrelated model used for Desert Mechanic Prudence doors.
- Added the separately exported Atreides Outpost window panes to the matching window pieces.

### Changed

- Refreshed the dashboard’s look with smoother controls, cards that lift gently on hover, and content that glides into place as it loads. If your device is set to reduce motion, the animations are turned off.
- Base previews now use full-detail building models taken from the game, with surface textures on most pieces. Detailed previews also download much less data than before.
- Windows, roofs, and machines from more building sets now show their glass panes, including Smuggler, Water Shipper, Sardaukar, and CHOAM pieces.
- Desert Mechanic doors now appear in base previews with their own door model.
- The top navigation now scrolls away with the page instead of staying pinned to the screen.
- Each base preview load now refreshes its model and surface files so the browser does not reuse an older cached copy.
- Grouped the Atreides Outpost building pieces and their shared surface images into separate sets so the base preview can find and update them more easily.
- Adjusted the foundation floor’s hex pattern to look closer to the reference.
- Corrected color handling that made some Atreides surfaces look muddy.

### Fixed

- Announcements load again after the announcement service moved to a new web address.

### Security

- Updated the dashboard’s web framework and supporting libraries to versions that close several known security issues.
- Pages now allow only the scripts the dashboard sends with each visit, keeping the strict script protection in place after the update.

## [1.20.4] - 2026-10-30

### Added

- Vehicle cards now show matching pictures, making vehicles easier to recognize.
- Added surface images for machinery and building pieces used in bases 2010 and 1250. More pieces should now show their intended look instead of plain gray.
- Added a full-screen base preview with desert scenery and day and night lighting.
- Grouped the top navigation into **Bases** and **Vehicles**. **Base Market** is now under **Bases**.
- Added a progress bar and a quick early view while large bases finish loading.

### Changed

- The preview remembers the saved view of your base and loads more building pieces together to reduce waiting.
- Reloading a preview checks for updated model and surface files and downloads newer copies when available.

### Fixed

- Corrected material colors and surface patterns that left some pieces gray or too dark.
- Prevented surface images from being applied to pieces that cannot use them, which could make them appear as dark specks.
- Removed an unrelated shield shape that appeared in place of some animated doors.
- Updated the available building pieces when visual files change and clarified the preview loading message.
- Kept a basic preview available when the detailed view takes too long or cannot load.

## [1.20.3] - 2026-10-29

### Added

- Choose which side of a base faces forward and take a picture when uploading or sharing it. The picture includes the whole visible base.
- Your chosen view and picture are saved with your base and restored when you open it again.
- Base owners can change a shared listing’s picture without sharing the base again or changing its place in the listings. Older listings can add a picture too.

### Changed

- Shared base cards use the picture selected by the owner.
- A picture is now required when sharing a base. Older listings remain available, and their owners can add a picture before community import is offered.

## [1.20.2] - 2026-10-28

### Added

- Added a community announcements panel across the dashboard.
- Shared base listings can show a straight-on picture above the piece count.
- Added **Import to my character** beside **Inspect base**, with clear messages for layouts that cannot be imported.

### Fixed

- Restored detailed previews for owned and shared bases, including camera and front-facing controls.
- Corrected building position, direction, and size so pieces line up with the base export, including left- and right-facing parts.
- Fixed the shared-base list so newer listings appear first, even when there are many.

## [1.20.1] - 2026-10-27

### Added

- Added a front-facing control so you can compare bases from the same direction.
- Added previews for upright and sideways pentashield pieces.
- Added **Base Market**, where owners can share bases and the community can browse by author or size, download layouts, and view available previews.

### Changed

- Kept each building piece in its exported position while letting you turn the whole preview to a chosen direction.
- Added available surface images for owned bases, including Atreides Outpost surfaces. Pieces without matching images keep a fallback appearance.
- Increased the size limit for base previews and corrected sloped wall, stair, and ramp placement.
- Refreshed the landing page and improved the exchange, map, inventory, market, and vehicle screens.

## [1.2.0] - 2026-10-26

### Added

- Added rotatable 3D maps for Hagga Basin and the Deep Desert, with location search, a compass, a scale, full-screen viewing, and terrain detail controls. A regular map view is available on devices that cannot show the 3D map.
- Added map markers that follow the terrain for spice fields, shipwrecks, and flour-sand deposits.
- Added an optional 3D preview for your bases under **My Bases**, with controls to turn, zoom, fit, and view from above. The preview shows how many building pieces it could display.
- Added share-card previews for the dashboard and its community page.

### Changed

- Updated the landing page, workspace, maps, inventory, and dialogs with a consistent look that adapts to different screen sizes.
- The public landing page now opens first. Older home-page links still work, and the signed-in workspace remains available.
- Seasonal colors now follow your local date and update at midnight.
- Improved map marker alignment while moving or zooming and removed duplicate markers.
- Discord sign-in now begins only when you select it.

### Security

- Kept sign-in, guild membership, administrator access, and private base access checks in place.
- Kept private base exports and account credentials out of public pages.
- Public share cards show dashboard information and links, not member activity.

### Known limitations

- The dashboard has not been confirmed to support 800,000 people at once. That would require planning and testing with the servers that host it.
- Community rewards were planned but were not included in this release.

## [1.1.3] - 2026-10-26

### Added

- Added a workspace for approved administrators.
- Added a searchable list of server actions, with forms, readable results, confirmation before changes, file transfers, and cleaned-up activity details.
- Added an optional administrator sign-in credential, separate from regular panel access.

### Changed

- Replaced the Dune-inspired interface with a simpler charcoal design across the dashboard, maps, inventory, and market.
- Simplified the landing page and made seasonal changes affect only its accent color.

### Security

- Checked administrator access for every action, kept administrator credentials private, limited file transfers, and removed sensitive details from activity records.
- Some administrator actions depend on the connected server’s permissions and were not checked against a live server.

## [1.1.2] - 2026-10-26

### Added

- Added seasonal color themes for holidays and a way to preview a theme using a link.
- Added an optional read-only connection for sharing guild-wide world summaries with a bot.
- Added safeguards to help the dashboard stay responsive when many requests arrive at once.

### Changed

- Reused recent map information to reduce repeated requests and made busy-server messages clearer, including when to try again.
- Improved startup and shutdown messages.
- Bot access is separate from sign-in and server credentials. The bot cannot make changes or act as a user.

### Known limitations

- Support for 800,000 people at once has not been confirmed and would require additional planning and testing.

## [1.1.1] - 2026-10-19

### Changed

- Live map positions for sandworms, non-player characters, civilians, sandstorms, and Coriolis storms are now available to all signed-in members of the configured guild. A separate staff role is no longer needed.
- Sign-in checks and player and vehicle privacy protections remain in place.

## [1.1.0] - 2026-10-19

### Added

- Added optional live information to Hagga Basin and Deep Desert maps, including sandworms, non-player characters, civilians, sandstorms, and Coriolis storms.
- Added controls for choosing a game instance and showing or hiding marker types. The map explains when live information is unavailable.

### Security

- At first, live information was limited to approved guild members with an extra staff role. That extra role was removed in version 1.1.1.
- Anonymous player and vehicle records are excluded. Live updates pause while a map is hidden and stop if access is denied.

## [1.0.7] - 2026-09-20

### Changed

- Cleaned up routine server messages so important warnings and errors are easier to find.

## [1.0.6] - 2026-09-20

### Added

- Added settings for choosing the dashboard’s network address and port when running it yourself, with sensible defaults.
- Added checks to catch invalid address and port choices before startup.

## [1.0.5] - 2026-09-20

### Added

- Added a change-history window inside the dashboard. Select the version in the footer to read it.
- Replaced the map pictures with detailed versions and split them into smaller pieces to help them load faster.
- Added Deep Desert terrain that changes with the current Coriolis layout, plus a regular map view for devices that cannot show the terrain.
- Added an optional A1–I9 Deep Desert grid and a countdown to the next Coriolis cycle.
- Added suggested Market Board prices based on the lowest current offer and the server’s buyback rate.

### Changed

- Improved map fit and zoom, marker visibility, status information, phone and tablet spacing, and seasonal colors.
- Made startup and server messages easier to understand.
- Improved protection for sign-in, sessions, shared images, and large file transfers.

### Fixed

- Corrected map cropping and alignment between terrain, grid, and markers.
- Added a regular map view when detailed terrain cannot load.
- Preserved exact large market prices and quantities in totals.

## [1.0.4] - 2026-09-08

### Changed

- Updated how the dashboard saves sign-in sessions, guild pictures, population history, and base import records. People running their own installation need to update its storage connection setting.

### Fixed

- Restored sign-in and sign-out, corrected errors when returning to the home page, and removed a startup warning.

### Upgrade notes

- The new storage starts empty, and old saved information is not copied. Everyone will need to sign in again. Guild pictures, population history, and import records will start over.

## [1.0.3] - 2026-09-08

### Added

- Added guild discovery, guild pictures, member information, and details connecting characters to their guild.
- Refreshed the landing page with community links, live server status, and sign-in actions.
- Improved the workspace overview, player details, market, population screens, and shared inventory appearance.

### Changed

- Improved small-screen layouts, sign-in sessions, and startup messages.

## [1.0.2] - 2026-09-07

### Added

- Added the original Crimson Skies workspace with character details, searchable storage, guild information, and holdings.
- Added Hagga Basin and Deep Desert maps with marker controls, spice status, and owned-resource details.
- Added population history with a 24-hour graph, Landsraad pictures, Discord avatars, and artwork for 1,514 items.
- Added private base import under **My Bases**, with checks for valid layouts, character selection, and duplicate actions.

### Changed

- Kept workspace navigation working across reloads and browser back and forward. Older map links now open the workspace.
- Kept global market information available while personal filters are used and explained partial market results more clearly.
- Removed unused live-information collection and diagnostic features.

### Known limitations

- Actual in-game base delivery, continuous 24-hour data collection, and a full 12-hour session were not confirmed for this release.
- Publishing the dashboard files did not put the website online; the site still needs to be set up and started by its owner.

## [1.0.1] - 2026-09-07

### Added

- Added retries for temporary player-profile and market loading errors.
- Improved market search and page navigation, and made expired sign-in messages clearer.
- Added clearer startup checks and sign-in activity messages.

### Changed

- Sign-in sessions now last up to 12 hours, and development sessions remain available across page reloads.
- Improved screen spacing, character headers, and landing-page controls on different screen sizes.
- Kept market listings visible if totals or buyback settings fail, with a warning when results may be incomplete.

### Fixed

- Preserved very large market quantities and prices and accepted more buyback setting formats.
- Corrected sign-out redirects and made session-ending failures visible.
- Added protection against cross-site sign-out requests and strengthened session privacy.

## [1.0.0] - 2026-09-06

### Added

- Released the Arrakis Control Dashboard for managing a Dune: Awakening server through its Console.
- Added Discord sign-in and checks for membership in the configured guild and role.
- Added player status, bases, vehicles, inventory, market, and map screens.
- Added protected base exports and settings for choosing the dashboard’s network address.
- Added safer sign-in sessions, request limits, clearer startup messages, and protection against exposing sensitive details.
