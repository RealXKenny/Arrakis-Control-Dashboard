# Features

- [Automatic seasons](automatic-seasons.md): numbered three-month seasons, deterministic 100-level generation, verified progress, automatic cosmetic claims and archived history.

| Feature                                                                                                                                                                  | Who uses it             | Page                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ---------------------------------------- |
| [Dashboard (portal, market, status)](dashboard.md)                                                                                                                       | Every member            | `/portal`, `/market`, landing `/`        |
| [Character, holdings and storage](player-management.md)                                                                                                                  | Every member            | `/character`, `/holdings`, `/storage`    |
| [Vehicles](vehicles.md)                                                                                                                                                  | Every member            | `/vehicles`                              |
| [Maps](maps.md)                                                                                                                                                          | Every member            | `/map`                                   |
| [Service status](dashboard.md#service-status)                                                                                                                            | Every member            | `/status` (always under More)            |
| [Live game chat](live-chat.md)                                                                                                                                           | Every member            | `/chat`                                  |
| [The Solaris Exchange](solaris-exchange.md)                                                                                                                              | Every member            | `/casino`, `/casino/games/[game]`        |
| [Poker Activity](poker-activity.md)                                                                                                                                      | Verified members        | Discord Activity (`/activity/poker`)     |
| [Guilds](guilds.md)                                                                                                                                                      | Members; leaders manage | `/guilds`, `/guild`                      |
| [Guild recruitment and applications](guild-recruitment.md)                                                                                                               | Applicants, leaders     | `/guilds`, `/guild`                      |
| [Base marketplace](marketplace.md)                                                                                                                                       | Every member            | `/bases`, `/bases/upload`, `/bases/[id]` |
| [Notifications](notifications.md)                                                                                                                                        | Every member            | Top navigation                           |
| [Sessions](sessions.md)                                                                                                                                                  | Members; administrators | Sign-in, sign-out, revocation            |
| [Appearance studio](appearance.md) provides the Console default, all 66 upstream theme choices and custom role colors with shared helpers and browser-local persistence. |

[Saved activity views](activity-views.md) preserve named portal widgets, inbox/task filters and planning context across workspaces, with private per-account configuration at `/activity-views`.

[Personal data controls](personal-data.md) export or erase private notes, plans and retained sharing snapshots at `/personal-data`, with explicit scope review and stale-save protection.

[Data freshness and outages](data-freshness.md) distinguish successful source observations, attempted reads, stale/partial data and failures across the inbox and inventory/asset lookup panels.

[Keyboard command palette](command-palette.md) searches authorized navigation and explicitly looks up accessible bases/vehicles, with keyboard and mobile entry.

[Mobile quick actions](mobile-quick-actions.md) prepare supply searches, open owned/shared bases and take members directly to operation briefings from `/portal`.

[Privacy center](privacy-center.md) controls reviewed, expiring member-link publication of profile, location, crafting and supply cards at `/privacy`.

[Personal tasks](personal-tasks.md) link private checklist entries to items, bases, vehicles, personal projects and goals at `/tasks`.

[Notification preferences](notification-preferences.md) add inbox category controls, timezone quiet hours, cooldowns, dismiss and snooze.

The [actionable inbox](actionable-inbox.md) combines authorized asset, supply and operation alerts at `/inbox`, with explicit coverage for unsupported monitoring sources.

| Feature                                                    | Who uses it                          | Page                                     |
| ---------------------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| [Dashboard (portal, market, status)](dashboard.md)         | Every member                         | `/portal`, `/market`, landing `/`        |
| [Customizable portal widgets](portal-widgets.md)           | Every member, including solo players | `/portal`                                |
| [Character, holdings and storage](player-management.md)    | Every member                         | `/character`, `/holdings`, `/storage`    |
| [Vehicles](vehicles.md)                                    | Every member                         | `/vehicles`                              |
| [Maps](maps.md)                                            | Every member                         | `/map`                                   |
| [Service status](dashboard.md#service-status)              | Every member                         | `/status` (always under More)            |
| [Live game chat](live-chat.md)                             | Every member                         | `/chat`                                  |
| [The Solaris Exchange](solaris-exchange.md)                | Every member                         | `/casino`, `/casino/games/[game]`        |
| [Poker Activity](poker-activity.md)                        | Verified members                     | Discord Activity (`/activity/poker`)     |
| [Guilds](guilds.md)                                        | Members; leaders manage              | `/guilds`, `/guild`                      |
| [Guild recruitment and applications](guild-recruitment.md) | Applicants, leaders                  | `/guilds`, `/guild`                      |
| [Base marketplace](marketplace.md)                         | Every member                         | `/bases`, `/bases/upload`, `/bases/[id]` |
| [Notifications](notifications.md)                          | Every member                         | Top navigation                           |
| [Sessions](sessions.md)                                    | Members; administrators              | Sign-in, sign-out, revocation            |

Public pages: `/` (landing) and `/changelog`. Every page in the signed-in workspace calls `requireSession()` itself; anonymous
visitors are redirected to `/login`. Which data you see depends on your linked in-game character, resolved through the Console.

## Common requirements

A working [Console connection](../configuration/dune-console.md), Redis in production, and a member who holds the
configured Discord role. Features that read the Console show an "unavailable" state, without stacks or credentials, when it
cannot be reached ([Console connection troubleshooting](../troubleshooting/console-connection.md)).

## Linking your character

Character-specific pages require that your Discord account is linked to a character through the Console's Discord adapter
(RedBlink's link flow: `players/link` + `players/link/verify`, which whispers a verification code to the online player).
The dashboard displays the link; it does not create it. See [RedBlink integration](../integrations/redblink-dune-docker.md).
