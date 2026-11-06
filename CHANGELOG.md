# Changelog

All notable changes to Arrakis Control Dashboard are documented here.

## [Unreleased]

## [1.20.6] - 2026-11-05

### Added

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
