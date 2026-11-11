# Character, holdings and storage

## Purpose

Show a member their own character and assets. (Operating on _other_ players — kick, grants, resets — is an administrator
function in the [administrator panel](administrator-panel.md); members cannot affect other players.)

## Pages

| Page         | Route               | Shows                                                                |
| ------------ | ------------------- | -------------------------------------------------------------------- |
| Character    | `/character`        | Status, progression, factions, inventory, water, journey information |
| Holdings     | `/holdings`         | Owned and shared bases, access, details                              |
| 3D preview   | `/holdings/preview` | Interactive renderer for owned bases                                 |
| Base storage | `/storage`          | Containers on your bases and their contents                          |

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

## Universal item finder (N001)

Open **Storage → Universal item finder** and enter an item name or template ID. Results show individual stacks across the linked character's backpack/gear/loadout/schematics, base containers and vehicle cargo, with quantity, reported grade, durability, available augments, source IDs, inventory and zero-based slot. Workspace links lead to Storage, Holdings or Vehicles. No game guild is required and no inventory or currency is changed.

Each search resolves the current adapter link, ignores cached session character IDs, discovers assets only through player-scoped lists, and independently checks canonical controller roster membership on every base/vehicle. Base containers additionally require a reported child access level that permits the character's current rank. Missing/unsupported permissions fail closed. Public/guild-only assets outside those personal rosters are not searched. Raw world/admin data and base-wide item rollups are never returned to the browser.

The member Console key needs players, bases and vehicles read scopes, including roster and child-access reads. Unsupported schemas, missing scopes, failed reads and restricted containers appear in source coverage; they are never represented as empty successful sources. Every search uses fresh uncached reads, with timestamps rather than promises of live state. Unknown readings remain unknown; reported decimal strings retain their exact quantities.

Searches allow six attempts per member per minute plus the shared read budget. Three workers, 4-second provider deadlines (without read retries), a 25-second overall deadline, 20 bases, 20 vehicles, 80 containers, 5,000 inspected stacks and 200 matches bound the work. Larger/truncated source lists and exhausted limits are marked partial. Cancel or leave the page to abort; the browser also has a 30-second deadline. The server honors request cancellation where the host forwards it. Changes made in game during a search may appear on the next search; this is not an atomic inventory snapshot or a delivery receipt.

## Troubleshooting

"No linked character": complete the link flow ([RedBlink integration](../integrations/redblink-dune-docker.md)). Stale data: the Console
may report slowly; see [Console connection](../troubleshooting/console-connection.md).

## Related

[Marketplace](marketplace.md) (share an owned base) · [Vehicles](vehicles.md) · [API: players](../api/players.md)
