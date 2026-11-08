# Vehicles

## Purpose

List the vehicles the signed-in member can access, with access level, status and location data the Console provides.

## Requirements

A linked character and `CONSOLE_API_KEY` Read on players/vehicles. Route: `/vehicles`.

## How it works

The server loads `/api/players/{id}/vehicles` for the linked character, normalizes the rows (`features/vehicles/normalize.ts`)
and filters to vehicles the member may access (`isVehicleAccessible`). The page shows vehicle cards with an access bar. Raw
Console payloads are never sent to the browser; unknown or oversized fields are dropped.

## Limitations

Vehicle management actions (permissions, custodian transfer, storage, deletion) exist only in the [administrator panel](administrator-panel.md)
and depend on your Console's API and key scopes; the member page is read-only.

## Troubleshooting

Empty list: no linked character, no accessible vehicles, or the Console is unreachable ([Console connection](../troubleshooting/console-connection.md)).

## Related

[Maps](maps.md) (vehicle markers) · [Character and holdings](player-management.md)
