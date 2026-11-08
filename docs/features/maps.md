# Maps

## Purpose

Interactive 2D/3D maps of **Hagga Basin** and **Deep Desert** with markers, your bases, vehicles and online players, plus an optional
realtime layer.

## Requirements

Sign-in and `CONSOLE_API_KEY` Read on maps and players. Realtime positions need the optional realtime agent on the Console side
(the Console serves `/api/realtime/objects`; see [RedBlink integration](../integrations/redblink-dune-docker.md)). Without it the
map still works and the realtime layer reports itself unavailable.

## Usage

Open `/map`, switch between the two maps, filter and search markers, and open marker details. Marker identity is consistent across
projections and searches. Deep Desert uses the Console's `coriolisLayout` (0 to 11) to choose terrain and shows a Coriolis
countdown when the Console reports the next cycle time. If WebGL2 is unavailable the 2D image fallback is used.

## API

`GET /api/v2/map?map=HaggaBasin|DeepDesert` and `GET /api/v2/map/realtime?map=…` ([API: server and maps](../api/server.md#maps)).
Unknown map names return 400.

## Limitations

Terrain bundles and models ship with the application (`src/assets`); terrain paths are allowlisted. Large worlds are rendered
near the camera only. Data freshness follows Console polling.

## Troubleshooting

Blank map: Console unreachable or no marker scope. 3D is slow: software rendering without a GPU; use the 2D view.

## Related

[Dashboard](dashboard.md) · [Vehicles](vehicles.md)
