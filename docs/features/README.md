# Features

| Feature                                           | Who uses it                | Page                                       |
| ------------------------------------------------- | -------------------------- | ------------------------------------------ |
| [Dashboard (portal, market, status)](dashboard.md) | Every member               | `/portal`, `/market`, landing `/`          |
| [Character, holdings and storage](player-management.md) | Every member         | `/character`, `/holdings`, `/storage`      |
| [Vehicles](vehicles.md)                           | Every member               | `/vehicles`                                 |
| [Maps](maps.md)                                   | Every member               | `/map`                                      |
| [Guilds](guilds.md)                               | Members; leaders manage    | `/guilds`, `/guild`                         |
| [Guild recruitment and applications](guild-recruitment.md) | Applicants, leaders | `/guilds`, `/guild`                         |
| [Base marketplace](marketplace.md)                | Every member               | `/bases`, `/bases/upload`, `/bases/[id]`    |
| [Notifications](notifications.md)                 | Every member               | Top navigation                              |
| [Administrator panel](administrator-panel.md)     | Administrators only        | `/admin`                                    |
| [Audit logs](audit-logs.md)                       | Administrators             | `/api/v2/admin/audit`, stdout               |
| [Sessions](sessions.md)                           | Members; administrators    | Sign-in, sign-out, revocation               |

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
