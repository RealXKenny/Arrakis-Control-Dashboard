# Changelog

## Patch Notes v2.0.0

### New Features

- Arrakis Control has been rebuilt from the ground up as version 2 with a new "Modern Dune" look: deep obsidian backgrounds, muted desert-sand panels, Spice Melange amber for actions and active states, sharp corners and flat, hard shadows.
- New landing page with a hero and a feature grid, a sticky top navigation bar, and a custom logo and favicon.
- New workspace bar under the top navigation for Overview, Character, Holdings, Storage, Map, Vehicles, Market, Base marketplace, Guilds and My guild.
- New Market grid: a strict 5 × 5 board with 25 listings per page, search, sorting and a My listings filter. The old intelligence and buyback modules have been removed.
- New Vehicles page: the Owned / Shared switcher only appears when you have both, and disappears entirely when you have no access. Container vehicles (BP_ContainerVehicle) show cargo capacity and no longer show a fuel bar.
- New Base Marketplace tab: upload your own base layouts (JSON up to 2 MiB) with a title, description and optional picture, then browse, search and filter what the community has shared by map. Each base has a detail page with its pieces, a layout download and Import to my character. You can remove your own listings at any time.
- New Holdings page with runtime, water and storage gauges for every owned and shared base, blueprint download and a full-screen 3D preview.
- New Storage page: search your inventory, filter by container and switch between a grid and a list.
- New Overview page with live field conditions for Hagga Basin and the Deep Desert, the Coriolis countdown, exchange totals, a 24-hour server population chart and the Landsraad balance of power.
- New Character page with vitals, faction standing, specializations, journey progress and equipped gear.
- Guilds and My Guild have been rebuilt: browse recruiting guilds, apply with the guild's own questions, chat privately with reviewers, manage your roster and ranks, edit joining requirements, upload a logo, review applications and talk to the administrators.
- The Live Map now has its own page for Hagga Basin and the Deep Desert.
- The Administration workspace has been rebuilt in the new design, including a new Discord announcements page.
- Discord changelog announcements: post release notes or live progress updates to a Discord channel as rich embeds with link buttons. Sending a progress update for the same version again edits the original message instead of posting a new one. A preview shows exactly what Discord will receive.
- Optional automatic announcement of each newly deployed release, sent once even when several servers start together.
- New public Changelog page that the announcement buttons link to.
- You can now sign in with your email and a password as well as with Discord. Choose a password after your first Discord sign-in. Sessions stay open for 30 days.
- One top navigation bar now carries every destination, grouped into Portal, Character, Assets, Vehicles, Bases, Market, Guilds, Map and More, with a roomy mega menu for each group. The page you are on is underlined in amber, the menu you have open is highlighted as a box, and each menu is anchored to its button and stays inside the screen. Below 1280 pixels the bar becomes a slide-out drawer.
- Times are now shown in your own timezone and language, for example `Nov 7, 2026, 11:19 PM EST`, with daylight saving handled for you. Hover a time to see the full local and UTC readings. This covers the Overview "Last reading", base publish dates, guild chat and application times and the administration screens. Countdowns such as the Coriolis cycle and the Landsraad term still count down as durations.
- The Changelog page and the release announcements understand the grouped Patch Notes format (New Features, Improvements, Fixes and so on).

### Improvements

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

### Fixes

- Fixed Redis Cluster node lists written with IPv6 addresses being read with the wrong host and port.
- A Discord outage or rate limit while re-checking a password login is no longer treated as a revoked Discord connection.
- The administration tab bar no longer sits in a narrower column than the page below it.

### Security

- Members who leave the Discord server or lose the required role are now signed out within 30 minutes. If Discord cannot be reached, a session stays valid for up to 6 hours after its last successful check.
- Password sign-in re-checks the Discord guild and role every time. Passwords are hashed with scrypt, Discord refresh tokens are encrypted before they are stored, and only a Discord-verified email can be linked to an account.
- Password sign-in is limited per email, per connection and per email-and-connection pair.
- Rate limits now trust only the address your reverse proxy appended to `X-Forwarded-For`, so a forged header can no longer pick a different limit bucket. Set `TRUSTED_PROXY_COUNT` to the number of proxies in front of the dashboard (default 1, use 0 when exposed directly).
- Uploads are counted while they stream in, pictures are identified by their contents rather than their file name, and every new change request checks that it comes from the dashboard itself.
- Discord announcements can never mention @everyone, roles or members, and only genuine Discord webhook URLs are accepted.

### Privacy

- Marketplace listings carry only a hashed publisher key. Your Discord ID is never shown to other members.
- Your email address stays on the server and is never sent to your browser.

### Removed

- Docker Compose files, the container entrypoint scripts and the custom application image. Releases are built on the standard Pterodactyl Node.js runtime instead.
- The second navigation row that used to sit under the top bar.
- Seasonal calendar themes and the Announcify announcement widget.
- The Discord link-preview card module, replaced by standard page metadata.
- The single-page portal with its `?view=` switcher, replaced by separate pages with their own addresses.

### Upgrade Notes

- Set `AUTH_SECRET` to at least 32 random characters. It is required in production.
- In the Discord developer portal, change the OAuth2 redirect URI to `<APP_URL>/api/auth/callback/discord`.
- With the dashboard stopped, run `npm run redis:rekey` for a dry run and `npm run redis:rekey -- --apply` to rename existing Redis keys, then start version 2. Move data to a cluster only afterwards.
- Everyone is asked to sign in again once after the upgrade.
- Optionally set `CHANGELOG_WEBHOOK_URL` and `CHANGELOG_AUTO_ANNOUNCE=true` to enable Discord announcements.
- Every stable release now attaches a ready-made Pterodactyl egg (`egg-arrakis-control-dashboard.json`) to its GitHub Release. The egg downloads the latest release and builds it in `/home/container`; the host supplies `SERVER_PORT`.
