# API: players, portal and bases

All routes need a session; the subject is always the **linked character of the signed-in member**, never a request parameter.

| Method | Route                             | Purpose                                                                       | Rate class            |
| ------ | --------------------------------- | ----------------------------------------------------------------------------- | --------------------- |
| GET    | `/api/player`                     | Character, inventory, water, bases, guild summary for the linked character    | legacy read (120/min) |
| GET    | `/api/portal/world?map=`          | World briefing for `HaggaBasin` or `DeepDesert` (400 `INVALID_MAP` otherwise) | legacy read           |
| GET    | `/api/bases/{baseId}/export`      | Export one **owned** base as a blueprint                                      | sensitive (30/min)    |
| POST   | `/api/bases/import`               | Import a blueprint into your character after a preview                        | sensitive             |
| GET    | `/api/bases/{baseId}/preview`     | Saved preview view settings for an owned base: `{ ok, view, hasPicture }`     | legacy read           |
| POST   | `/api/bases/{baseId}/preview`     | Save preview settings and a 640 × 360 PNG capture (owner-verified)            | sensitive             |
| POST   | `/api/bases/{baseId}/marketplace` | Publish an owned base to the marketplace (legacy publisher)                   | sensitive             |

## Behaviour and errors

- `GET /api/bases/{baseId}/export`: 403 `FORBIDDEN` unless the base ID is in the linked character's own bases; 403 `PLAYER_UNAVAILABLE`
  if the character is not linked; 400 `INVALID_BASE_ID`.
- `POST /api/bases/import`: JSON only (415 `UNSUPPORTED_MEDIA_TYPE` otherwise); 400 `INVALID_IMPORT` (preview first), 400 `INVALID_BLUEPRINT`,
  403 `PLAYER_UNAVAILABLE`, 403 `INVALID_ORIGIN`. A repeated delivery returns the existing record (`{ ok: true, record }`) instead of importing twice.
- `POST /api/bases/{baseId}/preview`: 400 `INVALID_PREVIEW` for a wrong-sized or invalid PNG; 503 `STORAGE_UNAVAILABLE`; responds with `{ ok, view, revision }`.
- All: 401 `UNAUTHORIZED`, 405 `METHOD_NOT_ALLOWED`, 429 `RATE_LIMITED`, 503 `SERVER_BUSY`/`RATE_LIMIT_UNAVAILABLE`.

Unsafe-size numbers (IDs, currency) are returned as decimal strings. Seller player IDs and Console-internal fields are removed from responses.

## Example

```http
GET /api/bases/1234567890/export HTTP/1.1
Host: dashboard.example.com
Cookie: __Host-dashboard_session=<opaque>
```

The success body is the blueprint document produced by the Console, normalized by the dashboard; an error body is
`{ "ok": false, "error": "You do not own this base", "code": "FORBIDDEN", "requestId": "…" }`.

## Related

[Character and holdings](../features/player-management.md) · [Marketplace API](marketplace.md) · [Errors](errors.md)

## Universal item finder

`GET /api/v2/items/find?q=<1–128 characters>` requires a verified dashboard session and current linked pawn/controller. It returns `{ items, sources, limited, startedAt }` with sanitized stack details, exact reported locations and workspace links; each source has a safe status/detail and `checkedAt`. Caller-supplied character, base or vehicle IDs grant no access. Responses are no-store. Anonymous requests return 401, missing verified links 403, invalid searches 400 and exhausted member/shared budgets 429. The route allows six searches per member per minute; [feature documentation](../features/player-management.md#universal-item-finder-n001) records scope, independent permission checks, limits, cancellation and partial-result behavior.

## Pinned item counters

| Method | Route                         | Behavior                                                                                                                   |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v2/items/pins`          | Current session/current linked controller's private `{ revision, pins }` selections; no counts are inferred                |
| POST   | `/api/v2/items/pins`          | Same-origin JSON `{ revision, pins: [{ templateId, name }] }`; at most 12 unique templates / 8 KiB; 409 on stale revisions |
| GET    | `/api/v2/items/pins/readings` | Fresh `{ counters, coverage, revision }` observations from the N001 permission pipeline; no raw inventory rows             |

All routes require verified sessions and fresh linked-character resolution, are no-store and ignore caller identity query parameters. Missing links return 403, invalid settings 400, oversized bodies 413, non-JSON writes 415, limits 429 and unavailable/corrupt Redis 503. Settings requests allow 30/member/minute; readings also share the six-per-minute finder budget. Each counter has an exact decimal-string `quantity` and `complete` flag. Incomplete quantities are observed lower bounds, not total stock. A link change between preference loading and inventory collection returns 409 `CHARACTER_CHANGED` before inventory reads. See [pinned counters](../features/player-management.md#pinned-item-counters-n002) for retention, revisions, source limits and uncertainty behavior.
