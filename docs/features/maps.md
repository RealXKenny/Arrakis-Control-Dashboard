# Maps

## Purpose

Interactive 2D/3D maps of **Hagga Basin** and **Deep Desert** with markers, your bases, vehicles and online players, plus an optional
realtime layer.

## Requirements

Sign-in and `DUNE_API_KEY` Read on maps and players. Realtime positions need the optional realtime agent on the Console side
(the Console serves `/api/realtime/objects`; see [RedBlink integration](../integrations/redblink-dune-docker.md)). Without it the
map still works and the realtime layer reports itself unavailable.

## Usage

Open the desired location from Maps in the navigation. Hagga Basin and Deep Desert have separate pages with filters, search and marker details. The legend shows layers observed in the current reading. Marker identity is consistent across
projections and searches. Deep Desert uses the Console's `coriolisLayout` (0 to 11) to choose terrain and shows a Coriolis
countdown when the Console reports the next cycle time. If WebGL2 is unavailable the 2D image fallback is used.

## API

`GET /api/v2/map?map=HaggaBasin|DeepDesert|Arrakeen|HarkoVillage|Overland` and `GET /api/v2/map/realtime?map=…` ([API: server and maps](../api/server.md#maps)). Realtime objects remain limited to Hagga Basin and Deep Desert.
Unknown map names return 400.

## Limitations

Terrain bundles and models ship with the application (`src/assets`); terrain paths are allowlisted. Large worlds are rendered
near the camera only. Data freshness follows Console polling.

Arrakeen, Harko Village and Overland show user-supplied game map images and read the signed-in member's linked character position from the Console's player endpoint every 30 seconds while visible. The server verifies the linked character before and after the read and returns no other players. Arrakeen shows an approximate marker throughout the image for testing; a courtyard reading disagreed with the projection, so accuracy can vary. Harko Village and Overland still require calibration. The marker stays visible during a refresh and is cleared when a read fails or the page is hidden.

Arrakeen also offers 49 user-supplied Map Genie location, service and contract markers, grouped by layer with a keyboard-accessible list. Twenty-one of them use positions read from the matching icons on the in-game Arrakeen map; the rest use Map Genie positions corrected with an affine fit against those icons. All were checked against three agent-measured standing positions (within about 3 m; residual about 4 m), so they stay approximate; quest markers may be offset to separate overlapping locations. They are independent of the Console and do not represent live activity.

Category-specific Arrakeen marker icons use the user-supplied atlas and metadata.

The dashboard checks the Console's read-only realtime snapshot for the linked character every three seconds while a match is available, and backs off when it is unavailable. Because agent player objects have no canonical identity, the server only offers an **inferred** position when a fresh ready source and the Console both show exactly one online player in that partition, the linked character matches by pawn ID, and the positions are within 300 metres. A changed link, ambiguous match, unavailable agent, missing player scope, or stale snapshot falls back to the existing Console position. No other player positions or raw agent objects are returned. The matching approach is informed by [MapViewer3D](https://github.com/dev-prophet-code/MapViewer3D/blob/main/docs/Agent-EN.md), with stricter ambiguity handling. Agent player collection and `players:read` plus `realtime:read` scopes are required. Overland is not listed in navigation or the command palette (its page still exists at `/map/overland`) and has no character marker: the Console has no points of interest for it, the realtime agent cannot read its Overmap process, and the Console roster position for an Overland player did not change for over eight minutes of travel on 2026-11-17 (its `last_seen` stayed at the moment of entry), so a position there would be stale. Do not add one until the Console reports live Overland positions.

The dashboard uses periodic snapshots, not the Console's 10 Hz SSE stream; marker movement therefore is not frame-rate realtime. A partition with multiple online players deliberately remains on the Console fallback because proximity alone cannot reliably establish identity.

## Troubleshooting

Blank map: Console unreachable or no marker scope. 3D is slow: software rendering without a GPU; use the 2D view.

## Related

[Dashboard](dashboard.md) · [Vehicles](vehicles.md)

Harko Village shows the Console's static points of interest (`GET /api/map/poi?map=HarkoVillage`: vendors, CHOAM Exchange, Bank, Imperial Consulate and house representatives) through `/api/v2/map/poi`. The server keeps only subtype and world x/y, never player, base or storage rows, and caches one read for five minutes. Points are projected with a fit made from 12 points matched to the in-game map (about 3 px residual); the same fit places the linked character and the live agent position, which was not yet verified live in Harko Village.

The image-based hub maps (Arrakeen, Harko Village and Overland) support drag-to-pan and wheel or button zoom from 100% to 400%, zooming around the cursor like Hagga Basin. Dragging does not start from a marker.

Operational note: the Console's realtime agent only discovers player objects when it scans a map process (at agent start and occasional rescans). A player who joins after the last scan has no agent object, so the dashboard keeps the Console position until the agent rescans. Restarting the agent while a player is online makes that player appear. Verified on 2026-11-17 against a real server: after a restart the agent reported the linked player in `SH_Arrakeen`, its position updated within a second of movement while the Console roster position lagged, and `matchLivePlayer` matched on live data.
