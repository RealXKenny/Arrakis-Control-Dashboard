# Character, holdings and storage

## Purpose

Show a member their own character and assets. (Operating on *other* players — kick, grants, resets — is an administrator
function in the [administrator panel](administrator-panel.md); members cannot affect other players.)

## Pages

| Page            | Route                | Shows                                                                                   |
| --------------- | -------------------- | --------------------------------------------------------------------------------------- |
| Character       | `/character`         | Status, progression, factions, inventory, water, journey information                    |
| Holdings        | `/holdings`          | Owned and shared bases, access, details                                                  |
| 3D preview      | `/holdings/preview`  | Interactive renderer for owned bases                                                      |
| Base storage    | `/storage`           | Containers on your bases and their contents                                               |

## Requirements

Your Discord account must be linked to a character in the Console adapter. Without a link the pages explain that and show nothing
character-specific. The Console must grant `CONSOLE_API_KEY` Read on players and bases.

## Permissions

Everything is derived from the server-verified session and the linked character; query parameters cannot select someone else.
Base lists use the Console's player→bases relationship, so you only see bases you own or have been granted.

## Behaviour notes

- Large unsafe numbers (IDs, currency) stay decimal strings until display.
- Base preview uses the shared map building-model catalogue with metre-scaled transforms, indexed pentashield sizes and partial
  coverage reporting; up to 40 world models are allocated near the camera, with a 2D fallback if WebGL2 is missing.
- Owned-base export (`GET /api/bases/{baseId}/export`) is rate limited as sensitive (30/min) and available to the base owner.

## Troubleshooting

"No linked character": complete the link flow ([RedBlink integration](../integrations/redblink-dune-docker.md)). Stale data: the Console
may report slowly; see [Console connection](../troubleshooting/console-connection.md).

## Related

[Marketplace](marketplace.md) (share an owned base) · [Vehicles](vehicles.md) · [API: players](../api/players.md)
