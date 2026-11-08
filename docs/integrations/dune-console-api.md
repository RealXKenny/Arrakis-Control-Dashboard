# Dune Console API (how the dashboard uses it)

The Console API is documented by its own project (RedBlink's `docs/console/API-REFERENCE.md`, "Current" status, ~380 routes). This
page covers only how the **dashboard** talks to it. Dashboard code: `src/server/integrations/dune.ts` and
`src/server/integrations/dunedocker/transport.ts`.

## Request behaviour

| Aspect            | Behaviour                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Auth              | `Authorization: Bearer <key>` always. No Console passwords, cookies or CSRF tokens are used                           |
| Which key         | Member features `CONSOLE_API_KEY`; administrator catalog `ADMIN_CONSOLE_API_KEY`; adapter routes `ADAPTER_TOKEN`      |
| Timeouts          | 30 s default per request                                                                                              |
| Retries           | Reads: up to 3 attempts on 408, 425, 500, 502, 503, 504. Writes: never                                                 |
| Failures          | Provider errors become safe application errors (no stacks, credentials or raw bodies)                                  |
| Response checks   | A JSON body with `ok: false` is treated as failure even on HTTP 200                                                    |
| Normalization     | Every payload is parsed from `unknown`; unsafe-size numbers stay strings; IDs are URL-encoded                          |

## Upstream conventions worth knowing

- Paginated lists use `page` (default 0), `pageSize` (default 20), `q`, `sortColumn`, `sortDirection` and return `totalCount`.
- Mutations carry confirmation phrases in the body (the administrator panel supplies them); upstream rate-limits most mutations
  to roughly 20 requests/minute per session+IP, so heavy automation can hit Console `429` even though the dashboard's own
  administrator budget is 300/minute.
- Long operations return a `task` object; the panel streams task and log events (server-sent events, bounded to 60 s / 2 MiB).
- `GET /api/server/status` returns a versioned object (`schemaVersion`, `ok`, `data.summary`, containers, listeners, …).
- Error bodies look like `{ "error": "…", "reason": "…", "details": {} }`; the dashboard maps them to its own envelope.

## Console permissions the dashboard needs

See [Dune Console](../configuration/dune-console.md#suggested-key-scopes).

## Restricted operations

Upstream permanently denies `settings`, `database`, `setup`, `community` to API keys and write actions in `updates` and `addons`.
The dashboard's catalog marks such operations `restriction` and never forwards them.

## Related

[RedBlink integration](redblink-dune-docker.md) · [Administrator panel](../features/administrator-panel.md) · [Console connection troubleshooting](../troubleshooting/console-connection.md)
