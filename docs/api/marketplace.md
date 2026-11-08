# API: marketplace

Current store: `/api/v2/bases/marketplace*` (V2 family, `{ ok, … }` / `{ ok: false, error, code }`). Requires a session; the owner key is
never returned.

| Method | Route                                         | Purpose                                                                 |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------- |
| POST   | `/api/v2/bases/marketplace`                   | Publish a base (multipart)                                               |
| GET    | `/api/v2/bases/marketplace/{id}`              | Read a listing: `{ summary, layout }`; `?download=1` adds `Content-Disposition: attachment` |
| DELETE | `/api/v2/bases/marketplace/{id}`              | Delete your own listing                                                   |
| GET    | `/api/v2/bases/marketplace/{id}/image`        | The listing picture (PNG/JPEG/WebP), cached privately for an hour          |

## `POST /api/v2/bases/marketplace`

`Content-Type: multipart/form-data`; same-origin; 10 uploads per hour per member; total body ≤ about 2.75 MiB.

| Field       | Rule                                                                  |
| ----------- | --------------------------------------------------------------------- |
| `file`      | Required. Blueprint JSON, ≤ 2 MiB (`FILE_TOO_LARGE` 413, `FILE_REQUIRED` 400, `INVALID_BASE` 422) |
| `thumbnail` | Picture ≤ 700 KiB, sniffed as PNG/JPEG/WebP (`THUMBNAIL_TOO_LARGE`, `INVALID_THUMBNAIL` 415) |
| `title`, `description` | Bounded text (`INVALID_META` 400)                           |

Success: `201 { "ok": true, "id": "<24 hex>" }`. Limits: 409 `USER_LIMIT` (25 per member), 409 `STORAGE_LIMIT` (24 MiB per member), 503
`MARKETPLACE_FULL` (500 listings or 256 MiB total), 409 `ALREADY_PUBLISHED`. Other: 415 `UNSUPPORTED_MEDIA_TYPE`, 413 `PAYLOAD_TOO_LARGE`,
400 `INVALID_FORM`.

## `GET /api/v2/bases/marketplace/{id}`

Subject to the read budget (120/min). 404 `NOT_FOUND` when missing. The body is the summary (id, title, author, baseType, map, pieceCount,
placeableCount, publishedAt, hasThumbnail) and the layout.

## `DELETE /api/v2/bases/marketplace/{id}`

Same-origin. Removes the record, picture, size record and index entry and returns the member's counters. `404 NOT_FOUND` is returned both for
"not yours" and "not there".

## Legacy routes

`GET /api/base-marketplace` (list) and `GET /api/base-marketplace/{listingId}` (`?image=1`, `?download=1`) serve the older store; `POST /api/bases/{baseId}/marketplace`
publishes an owned base with its captured picture. Prefer the V2 routes.

## Related

[Marketplace feature](../features/marketplace.md) · [Migration](../deployment/migration.md)
