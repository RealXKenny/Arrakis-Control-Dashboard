# Privacy center (N095)

Open **More → Privacy center** (`/privacy`). Every account starts with four private cards: profile, location, crafting and supply. Solo members do not need a game guild or linked character. Nothing is published until the owner reviews a card and explicitly confirms publication.

## What is shared

- **Profile:** a chosen display name and introduction.
- **Location:** a manually entered map, location description and optional note. No live position is collected.
- **Crafting:** up to ten unique specialties, details and optional contact instructions.
- **Supply:** up to eight unique item offers, optional exact whole-number quantities, units, details and contact instructions. Quantities stay decimal strings, including values above JavaScript's safe integer limit.

These cards contain only text the owner enters. They never fetch account email, Discord identity, linked-character details, inventory, crafting unlocks or coordinates. They are self-reported coordination notes, not verified identity, ownership, stock levels or achievement evidence. Content renders as plain React text without executable HTML, Markdown or automatic external links.

**Save private draft** saves privately without changing an existing publication. **Review publication** freezes the exact content and duration for a separate **Publish reviewed …** confirmation. The owner preview and member page use the same content renderer. Changing a saved draft does not change the published snapshot; review and confirm again to replace it.

Choose one hour, 24 hours or seven days. Location sharing is limited to one or 24 hours. Expiry starts at the server-confirmed publication time and is checked on every fresh member read. The center reports sharing status as of its last confirmed server check; reload to refresh it.

## Audience and revocation

Published cards are available through one unlisted `/sharing/<random ID>` link. Viewers must pass the existing signed-in member authorization. This is not an anonymous public page, searchable directory or guild-only audience. Members who receive the link can pass it to other authorized dashboard members.

**Unpublish** removes one card while retaining its saved draft. **Revoke all sharing** clears all four publications and invalidates the old link together. **Replace member link** requires a separate confirmation and invalidates the old link while retaining current publications and expiry times. New links use 256 bits of cryptographic randomness. Fresh reads recheck both the index and the owner's current link ID; a stale index cannot restore an old link.

Revocation stops future fresh reads. It cannot retract information already received, saved or in flight. An already-open member page is not a live revocation stream. Browser prefetch is disabled on the center's member-view link, and authenticated responses use no-store headers.

These controls manage these four voluntary cards. Existing game rosters, chat messages, guild coordination records and base-marketplace publications retain their own authorization and controls; links to their workspaces appear in the center. N040 rescue cards, N053 guild stockpiles and N056 a crafting directory are separate backlog features, not implemented by these cards. This center does not claim to erase previously shared information throughout the application or mutate game resources.

## Persistence and security

Redis is authoritative. Version-1 owner records use `arrakis:{privacy}:v1:owner:<SHA-256(account ID)>`; link indexes use `arrakis:{privacy}:v1:link:<SHA-256(random ID)>`. Every key shares `{privacy}` for atomic standalone/Cluster Lua operations. There are no database-selection commands or cross-slot transactions.

Each owner record contains private drafts, independent publication snapshots, a UUID revision and a current link ID. It is bounded to 64 KiB UTF-8 and expires after 90 days without an owner read/write. Member views do not extend retention. Owner writes refresh the link index's matching retention. An absent index fails closed; an explicit valid owner write can restore routing without changing a published snapshot or its expiry.

Compare-and-set writes check the revision, current link ID and index ownership before changing any key. Concurrent publication, rotation and revocation have one winner; a stale request receives 409. Corrupt, empty, oversized, wrong-type or unknown-version records fail closed instead of being silently reset. Input schemas reject unknown fields, owner selectors, forged timestamps, missing publication confirmation, invalid Unicode and overlong/duplicate entries. Published responses use an explicit allowlisted projection: no private drafts, account identifier, revision or routing identifier appears in the response body.

Owner APIs and member reads use separate 30-per-account-per-minute budgets that fail closed when protection storage is unavailable. Mutations require same-origin JSON, the existing fresh session and a 16 KiB body bound. The owner always comes from the session. Security audits record the action/category and actor, never card contents or link IDs.

Client requests abort on unmount and have a ten-second deadline. Writes never retry automatically. Conflicts and uncertain failures keep the local draft/review, report that the last saved sharing may remain visible, and ask the owner to reload. Success is shown only after a valid server response. Unsaved edits do not survive navigation/reload; explicit reload discards them.

## API

`GET /api/v2/privacy` returns `{ record, checkedAt }` for the session owner. Missing records return private defaults with null revision/link. The record has `schemaVersion: 1`, `revision`, `shareId`, four `drafts` and four nullable `publications` containing `{ data, publishedAt, expiresAt }`.

`POST /api/v2/privacy` accepts one strict action, with the current UUID `revision` (or null for a missing record):

| Action        | Additional fields                                 |
| ------------- | ------------------------------------------------- |
| `save-draft`  | `card: { category, data }`                        |
| `publish`     | `card`, `hours` (1, 24 or 168), `confirmed: true` |
| `unpublish`   | `category`                                        |
| `revoke-all`  | none                                              |
| `rotate-link` | none                                              |

Categories are `profile`, `location`, `crafting`, `supply`. Profile data is `{ displayName, about }`; location is `{ map, directions, note }`; crafting is `{ specialties, details, contact }`; supply is `{ offers: [{ item, quantity, unit }], details, contact }`. Optional text uses empty strings. Drafts can be incomplete, but publishing requires a name, location description, specialty or offer respectively. Location cannot use 168 hours.

`GET /api/v2/privacy/shared/<shareId>` requires a member session and returns `{ data: { cards: [{ category, data, publishedAt, expiresAt }] } }`. Unknown/replaced links, entirely unpublished cards or entirely expired cards return 404. It never accepts an account ID as a lookup target. Page metadata remains generic.

## Deployment and verification

No dependencies, environment variables, SQL migrations or game API writes are added. Records initialize lazily. Rolling back the code leaves isolated, expiring Redis records; do not reset production accounts to test this feature.

Focused suites are `tests/unit/privacy/model.test.ts`, `tests/api/privacy.test.ts`, `tests/browser/privacy.spec.ts` and `tests/integration/redis-privacy.test.ts`. Integration targets must be disposable: the existing harness flushes them. The browser fixture models persistence; standalone Redis and six-node Cluster runs verify actual Lua semantics, concurrent writes, exact expiry, index rotation/recovery, account isolation and corruption handling.

Browser coverage exercises all four categories, draft/publication separation, authenticated member projection, unpublishing, link replacement, revoke-all, stale saves, failed-save recovery, keyboard/touch controls and widths 320/393/412/768/1440 with automated WCAG AA checks. Native Safari, physical devices and screen-reader products remain unverified. N096–N100 remain follow-up work on `feature/personalization`. No merge or deployment is authorized by this feature.
