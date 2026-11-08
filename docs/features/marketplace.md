# Base marketplace

## Purpose

Members share base blueprints with a front picture; others browse, preview and import them.

## Using it

| Action             | Where                         | Notes                                                                                           |
| ------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Browse             | `/bases`                      | Newest first, 12 per page                                                                        |
| Inspect / download | `/bases/[id]`                 | Interactive preview; download returns the portable layout JSON only (owner key removed)          |
| Share a base       | `/bases/upload`               | Layout `.json` (max 2 MiB) plus a front picture (PNG, JPEG or WebP, max 700 KiB)                  |
| Share an owned base | Holdings                     | Owner-verified capture of a 640 × 360 PNG; **a picture is required to publish**                  |
| Change picture     | Your listing                  | Updates the picture without changing its rank                                                     |
| Delete             | Your listing                  | Same `404` for "not yours" and "not there"                                                        |

Imports normalize optional fields and preserve the Console's claim, size, ownership and duplicate-delivery checks. Older listings keep
their layouts but need a picture before import.

## Limits (enforced atomically in Redis)

| Limit                      | Value                                   | Error                      |
| -------------------------- | --------------------------------------- | -------------------------- |
| Listings per member        | 25                                      | 409 `USER_LIMIT`           |
| Stored bytes per member    | 24 MiB (layout + picture)               | 409 `STORAGE_LIMIT`        |
| Listings in total          | 500                                     | 503 `MARKETPLACE_FULL`     |
| Stored bytes in total      | 256 MiB                                 | 503 `MARKETPLACE_FULL`     |
| Uploads                    | 10 per hour per member                  | 429 `RATE_LIMITED`         |
| Duplicate publish of an ID | refused                                 | 409 `ALREADY_PUBLISHED`    |

Per-listing sizes are recorded so deleting a listing returns exactly what publishing took.

## Ownership

Listings are owned by an opaque **owner key**: an HMAC (`OWNER_KEY_SECRET`, or derived from `AUTH_SECRET`) of the member's Discord ID.
Older listings used a guessable SHA-256 key; both are accepted until you run `npm run marketplace:rekey`
([migration](../deployment/migration.md)). **Changing `OWNER_KEY_SECRET` later orphans listings** unless you migrate with
`OWNER_KEY_PREVIOUS_SECRET`.

## Limitations (accepted)

Quotas are per member and global, not per guild. There is no automatic expiry of stale listings.
Retention policy is an owner decision ([security overview](../security/security-overview.md#known-limitations-and-accepted-risks)).

## Troubleshooting

`INVALID_BASE` (422): the file is not a valid layout. `FILE_TOO_LARGE`: over 2 MiB. `INVALID_THUMBNAIL`: not PNG/JPEG/WebP (content-sniffed, not by extension).

## Related

[API: marketplace](../api/marketplace.md) · [Character and holdings](player-management.md) · [Migration](../deployment/migration.md)
