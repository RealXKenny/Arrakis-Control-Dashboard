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

Arrakeen, Harko Village and Overland show user-supplied game map images and the signed-in member's linked character position from the Console's player endpoint, refreshed every 30 seconds while visible. The server verifies the linked character before and after the read and returns no other players. These pages provide links to third-party community maps; those maps are external and do not receive or display dashboard coordinates. Arrakeen shows an approximate marker throughout the image for testing; a courtyard reading disagreed with the projection, so accuracy can vary. Harko Village and Overland still require calibration.

Arrakeen also offers 49 user-supplied Map Genie location, service and contract markers, grouped by layer with a keyboard-accessible list. Their positions are approximately aligned from the supplied Map Genie screenshot; quest markers may be offset to separate overlapping locations. They are independent of the Console and do not represent live activity.

## Troubleshooting

Blank map: Console unreachable or no marker scope. 3D is slow: software rendering without a GPU; use the 2D view.

## Related

[Dashboard](dashboard.md) · [Vehicles](vehicles.md)
