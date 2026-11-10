# Changelog

## Patch Notes v2.0.0

### New Features

- Recruit onboarding: private guild welcome guides, rules acknowledgments, useful locations, mentor assignments and per-character checklist progress. Verified leaders review progress; changed rules/items require fresh acknowledgment/completion, with bounded storage, revision protection, retained drafts and disband cleanup.

- Shared guild base directory: members can search private locations and filter by map, purpose and archive status; verified leaders maintain contact details, access instructions and notes. Bounded storage, revision conflicts, retained drafts and disband cleanup protect coordination without changing in-game permissions or publishing blueprints.

- Guild resource requests: members can request materials, pledge exact quantities and report deliveries; requesters or leaders confirm receipt separately. Private views, partial-delivery tracking, quotas, revision conflicts and retained drafts protect coordination without moving items or currency automatically.

- Guild operations planner: leaders can schedule runs with meeting points and role capacities, while members can join, switch roles or withdraw before the start. Local-time schedules, private team lists, conflict protection, draft preservation and leader cancellation/completion controls keep guild plans organized.

- Guild noticeboard: current members can read a private daily message, priorities and pinned announcements on My guild. Freshly verified leaders can create, edit and remove posts, with conflict protection and drafts preserved after failed saves.

- New Service status page embeds the HetrixTools hosting availability report with automatic sizing and a direct-report fallback. It requires sign-in and always stays under More on desktop and mobile.
- New Community events page under More brings competitions, prize pools, schedules, entry instructions and rules together. Members can filter upcoming, current and past events; dates display in their own timezone.
- The first Base Building Competition offers 500,000 Solaris coins and a couple of new in-game items. Dates, specific item prizes and entry or judging details remain to be announced; prize listings do not award currency or items automatically.
- Administrators can create, draft, publish, feature, edit and delete community events from Players & community. Events persist in Redis, drafts stay private, conflicting edits are rejected, and deleting the initial competition does not cause it to reappear.
- Arrakis Control has been rebuilt from the ground up as version 2 with a new "Modern Dune" look: deep obsidian backgrounds, muted desert-sand panels, Spice Melange amber for actions and active states, sharp corners and flat, hard shadows.
- New landing page with a custom dune-ridge identity, a responsive hero, feature illustrations and dedicated sections for players, communities and server operators. The header has a circular V2 badge; the simplified footer shows the brand and Funcom disclaimer without a version badge.
- New Market grid: a strict 5 × 5 board with 25 listings per page, search, sorting and a My listings filter. The old intelligence and buyback modules have been removed.
- New Vehicles page: the Owned / Shared switcher only appears when you have both, and disappears entirely when you have no access. Container vehicles (BP_ContainerVehicle) show cargo capacity and no longer show a fuel bar.
- New Base Marketplace: upload your own base layouts (JSON up to 2 MiB) with a title, description and required front picture, then browse, search and filter what the community has shared by map. Each base has a detail page with its pieces, a layout download and Import to my character. Owners can change the picture without changing the listing's position, or remove their listings.
- New Holdings page with runtime, water and storage gauges for every owned and shared base, blueprint download and a full-screen 3D preview.
- New Storage page: search your inventory, filter by container and switch between a grid and a list.
- New Overview page with live field conditions for Hagga Basin and the Deep Desert, the Coriolis countdown, exchange totals, a 24-hour server population chart and the Landsraad balance of power.
- New Character page with vitals, faction standing, specializations, journey progress and equipped gear.
- Guilds and My Guild have been rebuilt: browse recruiting guilds, apply with the guild's own questions, chat privately with reviewers, manage your roster and ranks, edit joining requirements, upload a logo, review applications and talk to the administrators. Application questions support short text, paragraphs, dropdowns, timezones, checkboxes and decimal-number answers.
- The Live Map now has its own page for Hagga Basin and the Deep Desert, with 2D and 3D views, searchable markers, bases, vehicles, and an optional realtime layer for online players and world objects. A 2D fallback remains available when WebGL2 is unavailable.
- The Administration workspace has been rebuilt in the new design, including a new Discord announcements page.
- Discord changelog announcements: post release notes or live progress updates through the main bot as Components V2 containers with section dividers and link buttons. The administration composer previews the container layout, and later progress updates edit the bot's tracked messages instead of posting a new copy each time.
- Optional automatic announcement of each newly deployed release, sent once even when several servers start together.
- New public Changelog page that the announcement buttons link to.
- You can now sign in with your email and a password as well as with Discord. Choose a password after your first Discord sign-in. Sessions stay open for 30 days.
- One top navigation bar now carries every destination, grouped into Portal, Character, Assets, Vehicles, Bases, Market, Guilds, Map and More, with a roomy mega menu for each group. The page you are on is underlined in amber, the menu you have open is highlighted as a box, and each menu is anchored to its button and stays inside the screen. Below 1280 pixels the bar becomes a slide-out drawer.
- Times are now shown in your own timezone and language, for example `Nov 7, 2026, 11:19 PM EST`, with daylight saving handled for you. Hover a time to see the full local and UTC readings. This covers the Overview "Last reading", base publish dates, guild chat and application times and the administration screens. Countdowns such as the Coriolis cycle and the Landsraad term still count down as durations.
- The Changelog page and the release announcements understand the grouped Patch Notes format (New Features, Improvements, Fixes and so on).
- Optional Live Chat connects the dashboard to Dune: Awakening through the existing bot-compatible game chat protocol. Choose a configured destination, read incoming player messages and send messages from your authenticated dashboard account without refreshing the page.
- Live Chat combines game, dashboard and verified Discord-relay messages in one chronological conversation. Discord relays show the relayed sender's name and a Discord-blue badge; genuine player messages keep the Game badge, even when their text imitates a Discord prefix.
- Chat history is stored in Redis Streams, with 50-message initial pages, older-message pagination, and configurable defaults of seven days and 10,000 messages per destination. Redis Pub/Sub and authenticated Server-Sent Events provide live updates and missed-message recovery.
- The standard Node.js/Pterodactyl launcher automatically starts and supervises the Chat Bridge when chat is enabled. Incoming game messages are consumed before anyone opens Live Chat, and the worker exposes local health, readiness and non-content metrics endpoints.
- RabbitMQ TLS accepts complete PEM certificates directly in `.env`, including multiline values and escaped newlines. Optional client certificates and private keys support mutual TLS; existing certificate-file settings remain supported.
- Discord profile pictures are now stored as image bytes in Redis and served through authenticated dashboard URLs across navigation, profiles and chat. Browsers no longer load pictures from Discord's CDN; missing pictures are fetched by the server and saved before being served.
- Administrators can inspect a bounded, redacted security audit trail and revoke dashboard sessions through the administration API.
- The Solaris Exchange adds a Dune-themed casino lobby, wallet, round history, fairness tools, rules and administrator transfer reconciliation. Its six game modules are The Emperor's Hand (Blackjack), The Spice Wheel (Roulette), Fate of Arrakis (Dice), Spice Harvest (Mines), Ornithopter Run (Crash) and The Great Houses (Coin Flip).
- Casino wagers use real in-game Solaris through a Redis-backed wallet, with exact-integer balances, reserved wagers, idempotent settlement, committed server seeds and configurable wager and payout ceilings. Deposits, withdrawals and wagering remain disabled by default; live money movement requires deployment-specific verification before enabling it.

### Improvements

- Large Discord changelogs now split into numbered Components V2 messages with complete notes and all categories. The admin composer previews every part; updates reuse the same posts and remove surplus parts instead of truncating content.

- Signed-in visitors now see Open dashboard actions instead of Discord sign-in prompts. Signed-out topbars show only the brand and Sign in, including mobile.
- Discord release and progress announcements now use the main bot token and Components V2 containers instead of webhooks. Published community events announce automatically, update their existing posts, and report pending or uncertain outcomes accurately.
- Large changelog announcements split complete notes and categories across numbered Discord messages instead of silently clipping the release. Oversized individual notes continue across parts, the composer previews the series, and announcements exceeding the 50-message limit are rejected before sending.
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
- Bases and Vehicles show up to four cards per row on very wide screens, and the administration tab bar lines up with the page.
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
- Solaris transfers require a fresh linked-character check and an offline character. A Console adjustment must confirm the exact currency, amount, offline state and expected resulting balance before wallet settlement; unclear outcomes are held for an administrator rather than automatically retried. Recovery handles interrupted reservations and round settlement without granting duplicate balance.

### Fixes

- Changelog counters distinguish release updates from their individual changes, so version 2 is shown as one update. Selected text uses a visible blue highlight for copying.
- Restored the shared Obsidian, Sand and Spice CSS color variables so primary buttons, focus rings and feature styles consistently resolve their intended colors.
- Header controls and branding now adapt to narrow screens while retaining usable touch targets. Lower-priority destinations move into More without horizontal overflow; Community events and Service status always remain inside More.
- Fixed Redis Cluster node lists written with IPv6 addresses being read with the wrong host and port.
- A Discord outage or rate limit while re-checking a password login is no longer treated as a revoked Discord connection.
- The administration tab bar no longer sits in a narrower column than the page below it.
- The Market loading grid now scrolls inside the mobile workspace instead of pushing the whole page wider than the screen.
- Chat delivery updates no longer try to append an existing Redis Stream ID. Separate expiring delivery-state records are overlaid on history, so a state change cannot collide with a stored message or leave it permanently pending.
- Browser network failures and lost publish confirmations now remain `Unconfirmed`, rather than being reported as a definite failure. Uncertain sends are never retried automatically; a deliberate status check reuses the original idempotency key.
- Retried or concurrent requests for the same chat message no longer start another publish sequence. Redelivered incoming events are deduplicated atomically before live notification.
- SSE reconciliation refreshes unresolved delivery states, protects against stale events overwriting newer states, subscribes before loading history and cleans up listeners when clients leave. Streams remain the durable recovery source when Pub/Sub notifications are missed.
- Invalid, expired or cross-destination Stream records are rejected on history and reconciliation reads, while pagination cursors still advance past them. Late events from a previous destination cannot leak into the newly selected conversation.
- The receive worker no longer fails while attempting to declare a custom dead-letter exchange that the existing game broker does not permit. Its outgoing envelope, exact case-sensitive routing keys and AMQP properties remain compatible with the reference bot.
- Authenticated profile images now use a consistent initials fallback if Redis storage or image loading is unavailable, instead of leaving a broken image in navigation, profiles or chat.

### Security

- Members who leave the Discord server or lose the required role are now signed out within 30 minutes. If Discord cannot be reached, a session stays valid for up to 6 hours after its last successful check.
- Password sign-in re-checks the Discord guild and role every time. Passwords are hashed with scrypt, Discord refresh tokens are encrypted before they are stored, and only a Discord-verified email can be linked to an account.
- Password sign-in is limited per email, per connection and per email-and-connection pair.
- Rate limits now trust only the address your reverse proxy appended to `X-Forwarded-For`, so a forged header can no longer pick a different limit bucket. Set `TRUSTED_PROXY_COUNT` to the number of proxies in front of the dashboard (default 1, use 0 when exposed directly).
- Uploads are counted while they stream in, pictures are identified by their contents rather than their file name, and every new change request checks that it comes from the dashboard itself.
- Discord announcement requests disable automatic mentions, use a fixed HTTPS Discord API origin, refuse redirects and verify that configured channels belong to the dashboard's Discord guild. Bot tokens and raw provider errors never enter the browser or announcement previews.
- Administration re-verifies the exact configured Discord administrator ID, guild, role and session. Sensitive operations require a recent interactive sign-in, with stricter defaults for destructive actions, uploads and downloads; unreviewed write operations default to the stricter policy.
- Administration routes expose only allowlisted Console operations, bounded request bodies, uploads, downloads and event streams. Provider redirects, arbitrary URLs, secret fields and raw upstream errors are rejected or sanitized.
- Guild settings, roster changes and application decisions require freshly verified linked-character leadership. Review leases, generation checks and idempotency protect concurrent decisions and reapplications; private conversations remain restricted to their intended participants.
- Production environment validation requires explicit administrator configuration and the required integration credentials. Console, adapter, bot and administration integrations retain separate credential settings. Redis transport settings, trusted proxy configuration and startup warnings help identify unsafe deployments before service begins.
- Chat history, send and SSE endpoints independently require a session and a configured destination. Sends enforce same-origin checks, bounded text and per-member and per-destination rate limits; chat content is rendered as text.
- RabbitMQ certificate-chain and hostname verification remain enabled. Inline PEM takes precedence over file paths; malformed certificates, incomplete client identities and incompatible keys fail safely without logging certificate contents, private keys, passwords or credential-bearing connection URLs.
- Avatar downloads use a fixed HTTPS Discord endpoint with no redirects, no forwarded session credentials, a five-second timeout, strict PNG checks and bounded image sizes. Authenticated cache misses have per-member and deployment-wide limits, and concurrent downloads are capped.
- The browser Content Security Policy no longer allows Discord's CDN as an image origin. Profile image responses are private, no-store, protected by `nosniff` and restricted to same-origin use.
- Security audit events are redacted and bounded, and session indexes support revocation without exposing raw session tokens. Workflow permissions, action pins and release-source checks limit privileged automation to trusted release paths.
- Community event mutations independently verify administrator identity, guild membership, role and recent sign-in. Same-origin checks, bounded bodies, rate limits and revision checks protect publishing and deletion; event text never becomes executable HTML.
- Casino routes derive wallet ownership from the session and keep unrevealed game state on the server. Uncertain currency adjustments are never automatically repeated, and reconciliation requires administrator verification and an audit record.

### Privacy

- Marketplace ownership uses an opaque publisher key rather than exposing the account ID as the listing's owner key.
- Your email address stays on the server and is never sent to your browser.
- Loading a profile picture no longer connects the member's browser directly to Discord's CDN. The dashboard server downloads a missing image once for its cache and serves subsequent requests from Redis while it remains retained.
- Pending, failed and uncertain dashboard chat payloads are excluded from shared history and SSE. Final failures remain local to the sender's open conversation; dismissing a notice does not send a deletion or retry request. Bounded internal records remain for idempotency and reconciliation.
- Chat operational logs, health checks and metrics omit message bodies and broker credentials. Inline TLS private keys are never written to temporary certificate files.
- Community event drafts are excluded from member pages and read APIs. The Discord bot token stays server-side, and announcement configuration is exposed to the editor only as a configured/not-configured status.

### Removed

- Root Docker build, Compose and ignore files, container entrypoint scripts and the custom application image. Releases use the standard Pterodactyl Node.js runtime, and optional chat starts through the existing Node.js launcher without an additional required process manager.
- The second navigation row that used to sit under the top bar.
- Seasonal calendar themes and the Announcify announcement widget.
- The Discord link-preview card module, replaced by standard page metadata.
- The single-page portal with its `?view=` switcher, replaced by separate pages with their own addresses.
- Technical broker names and routing keys have been removed from the public chat presentation, and failed sends no longer remain as shared conversation entries or offer an automatic resend action.
- Changelog webhook delivery and its URL setting have been replaced by the shared Discord bot token and configured channel IDs. Existing webhook-owned posts are not claimed or edited by the bot.
- Casino demo credits and refill flows have been removed; the Exchange uses real Solaris and its explicit server-side enablement gate.

### Upgrade Notes

- Set `AUTH_SECRET` to at least 32 random characters. It is required in production.
- In the Discord developer portal, change the OAuth2 redirect URI to `<APP_URL>/api/auth/callback/discord`.
- With the dashboard stopped, run `npm run redis:rekey` for a dry run and `npm run redis:rekey -- --apply` to rename existing Redis keys, then start version 2. Move data to a cluster only afterwards.
- Everyone is asked to sign in again once after the upgrade.
- To enable Discord announcements, set the server-only `DISCORD_BOT_TOKEN`, `CHANGELOG_CHANNEL_ID` and `COMMUNITY_EVENTS_CHANNEL_ID`. The existing main bot can be reused; no additional bot process or Gateway session is required. Remove the obsolete `CHANGELOG_WEBHOOK_URL` setting. Optionally set `CHANGELOG_AUTO_ANNOUNCE=true`; its first run records the current release as a baseline rather than replaying old releases.
- Give the bot View Channel, Send Messages and Read Message History in the configured text or announcement channels. Both channels must belong to `DISCORD_GUILD_ID`; a public HTTPS `APP_URL` supplies announcement links. Keep the token out of Git and logs and enter it through the hidden secret setting when using the Pterodactyl egg.
- Every stable release now attaches a ready-made Pterodactyl egg (`egg-arrakis-control-dashboard.json`) to its GitHub Release. The egg downloads the latest release and builds it in `/home/container`; the host supplies `SERVER_PORT`.
- Use Node.js 22 or newer. Build with `npm run build` and start with `npm start`; `npm run dev` retains the development launcher. Docker is not required.
- Keep `OWNER_KEY_SECRET` stable and separate from other credentials before retaining published marketplace listings. Review `npm run marketplace:rekey` and the migration guide before changing existing owner keys; legacy keys remain accepted until migrated.
- Review `ADMIN_DISCORD_IDS`, `ADMIN_REAUTH_HOURS`, `ADMIN_HIGH_RISK_REAUTH_MINUTES`, Redis TLS settings and the production hardening guide before deployment. Keep Console, adapter, bot and administration credentials separate.
- To enable Live Chat, configure `CHAT_ENABLED=true`, `RABBITMQ_URL`, `CHAT_BRIDGE_FUNCOM_ID` and `CHAT_SERVERS` with exact case-sensitive map keys. The launcher starts the worker automatically; `npm run chat:bridge` is a standalone diagnostic command and must not run beside that supervised worker.
- The chat broker account needs the existing `chat.map` exchange and permissions for broker-generated `amq.gen-*` queues, bindings and publishes. `CHAT_BRIDGE_QUEUE` is retained only for compatibility and is ignored; no named dashboard dead-letter resources need to be created.
- For RabbitMQ TLS, use `amqps://` with inline `RABBITMQ_TLS_CA`, optional paired `RABBITMQ_TLS_CERT` and `RABBITMQ_TLS_KEY`, or their `_PATH` alternatives. `RABBITMQ_CA_FILE` remains a legacy CA-file fallback. Trust the issuing CA, or an explicitly trusted self-signed server certificate; a server certificate is not a client identity. Use a hostname matching the certificate and keep verification enabled.
- Set `CHAT_DISCORD_BOT_FUNCOM_ID` only to the trusted relay bot's exact Funcom ID to enable Discord attribution. Quote environment values containing `#`. Redis supplies the existing avatar cache automatically; no image directory or new avatar environment settings are required.
- Existing Redis chat history survives dashboard restarts while retained, but the exclusive RabbitMQ receive queue does not collect an offline backlog. Messages sent while no dashboard consumer is connected cannot be recovered from Redis unless they were previously persisted. Publisher confirmation is not proof of in-game delivery.
- Community events initialize the first competition once per Redis store and retain edits across restarts. Published events are considered for automatic Discord announcements at startup and after saves; configure the bot and channel before enabling this behavior in production.
- Keep `CASINO_SOLARIS_ENABLED=false` until the transfer and reconciliation workflow has been independently verified for your deployment. Review `CASINO_MAX_WAGER` and `CASINO_MAX_PAYOUT` before enabling real wagers; there is no demo-money fallback.
- These notes describe the implemented code, not a claim that every integration is production-verified. Live game delivery, disposable standalone/Cluster Redis scripts, Discord channel permissions and real Solaris transfers require their respective infrastructure checks. See the feature and progress guides under `docs/` for remaining limitations.
