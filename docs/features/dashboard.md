# Dashboard: portal, status and market

## Purpose

The signed-in landing area and the community-wide views of the world.

## Pages

| Page         | Route        | Shows                                                                                                                  |
| ------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Landing      | `/`          | Public introduction and sign-in                                                                                         |
| Portal       | `/portal`    | World briefing (map markers, exchange stats, Landsraad), population and population history chart, your guild            |
| Market       | `/market`    | CHOAM exchange items, aggregated by item, with prices (full precision), listings and "my listings" for your character   |
| Changelog    | `/changelog` | Public release notes parsed from `CHANGELOG.md`                                                                          |

## Requirements and permissions

Sign-in plus the member role. Data comes from the Console with `CONSOLE_API_KEY` (Read on players, exchange, maps, landsraad;
see [Dune Console](../configuration/dune-console.md#suggested-key-scopes)). **My listings only ever shows orders that belong to
the linked character**, and seller player IDs from the Console never reach the browser.

## How it works

The portal reads through a snapshot/data provider that caches Console responses in Redis (`arrakis:dashboard:snapshot`,
`arrakis:read:v1:*`) so many members do not multiply Console load. Population is sampled in the background and stored for the
history chart. Reads are budgeted (120/min per client, `API_GLOBAL_READ_LIMIT` globally; [rate limiting](../configuration/rate-limiting.md)).

## Status API

`GET /api/server/status` returns real counts to anonymous visitors and nothing else ([API](../api/server.md#server-status)).

## Limitations

Values are only as fresh as the Console reports and the cache allows. Features the Console does not support (an unreachable
exchange, no realtime agent) are reported as unavailable instead of failing the page.

## Troubleshooting

Empty portal or market: [Console connection](../troubleshooting/console-connection.md). Slow pages: [performance](../troubleshooting/common-issues.md#performance).

## Related

[Maps](maps.md) · [Player pages](player-management.md) · [API](../api/server.md)
