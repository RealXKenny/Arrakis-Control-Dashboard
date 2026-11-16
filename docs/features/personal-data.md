# Personal data controls (N099)

Open **More → Personal data** (`/personal-data`) to export or erase your saved dashboard notes, plans and sharing snapshots. A linked game character or guild is not required. Each request derives ownership from the verified session; no owner supplied by the browser can select another account.

## Covered content

| Scope                                    | Export and deletion include                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Notes and plans (`tasks`)                | All private tasks, projects and goals, including notes, dates, completion state and typed planning references            |
| Sharing drafts and snapshots (`sharing`) | All four private profile/location/crafting/supply drafts and retained publication snapshots, including expired snapshots |
| Saved activity views (`views`)           | Named widget/map/filter settings and optional project/goal references; no copied task notes or game observations         |

The summary shows counts and opaque revision IDs without loading note text into the page. Sharing draft counts describe customized drafts; blank defaults are not counted. Published snapshots are counted separately. These are manually chosen dashboard cards, not a historical game inventory or location archive. Inventory observations and freshness history are view-local rather than a retained personal archive.

Portal layout, notification preferences and pinned-item selections retain their own settings controls. Browser-local appearance has separate Default and color export/import controls; it is independent of account-owned data. Account credentials, sessions, security audits, game characters, shared guild records, chat messages, marketplace publications and financial/game ledgers are outside this feature. Shared publications retain the controls in their original workspace. This is not account deletion or erasure of all community records.

## JSON export

Select one, two or all three scopes and choose **Export selected data**. A same-origin POST returns a private, no-store JSON attachment named `arrakis-personal-data.json`; the browser controls its save location. The versioned envelope contains `format: "arrakis-personal-data"`, `schemaVersion: 1`, an ISO `exportedAt` and selected `records` with `scope` and `data`.

Task records preserve their validated schema, revision and entries. Sharing exports explicitly project schema version, revision, drafts and publications; they omit the member-link identifier and Redis routing metadata. Account/session credentials and raw provider data are never included. There is no import/restore endpoint. Keep exports secure: chosen contact details, locations and private notes may be present.

The server validates each selected scope's expected revision and rejects changed data with 409. Scopes are read independently, not as one synchronized account snapshot. Export is bounded to 512 KiB on both server and client; responses are schema-validated before creating a download. A concurrent export already read or in flight can complete after deletion. Downloaded, opened or previously received copies cannot be retracted.

## Confirmed deletion and concurrency

Deletion reviews one scope at a time. The review freezes its revision and requires the exact phrase `DELETE MY DATA`. **Keep my data** cancels. Keyboard focus enters the review heading and returns to its originating button when the review closes. Controls support touch, narrow screens and reduced motion without animations.

Each deletion uses the existing store's atomic UUID compare-and-set operation. A simultaneous edit or another deletion wins once; stale requests receive 409 and cannot erase newer notes or restore old drafts. Sharing deletion also rotates its link and removes the previous member-link index atomically. Future requests to that link return 404. Already-open member pages are not live revocation streams.

Deletion replaces private content with an empty, schema-valid record and a new server-generated UUID. Minimal revision metadata (and a new empty sharing routing index) remains for 90 days of inactivity to reject stale saves. Reads refresh this existing retention. This is content erasure, not removal of every storage byte or audit record. Once an empty record expires, its stale non-null revisions still conflict with an absent record; a very old null-revision draft may be accepted after the fence expires. No tombstone is kept indefinitely.

The task operation uses one key. Sharing owner/index keys retain the existing `{privacy}` hash tag. The three scopes are deliberately erased separately; there is no cross-slot Redis transaction or false account-wide atomicity claim. Redis remains authoritative. No schema migration, new database, environment variable or dependency is needed.

Corrupt/oversized records or inconsistent routing ownership fail closed without overwriting content or claiming successful erasure. On a conflict, timeout or uncertain failure, the page requires **Reload data summary** before another action; writes never retry automatically. A timeout may have committed. Hiding/unmounting aborts requests and clears the review; returning requires a new summary.

## API and security

| Method | Route                          | Purpose                                                           |
| ------ | ------------------------------ | ----------------------------------------------------------------- |
| GET    | `/api/v2/personal-data`        | Counts and revisions for all three owned scopes                   |
| POST   | `/api/v2/personal-data/export` | `{selection: [{scope, revision}]}` for one to three unique scopes |
| POST   | `/api/v2/personal-data/delete` | `{scope, revision, confirmation: "DELETE MY DATA"}` for one scope |

All endpoints require the existing refreshed member session and return private/no-store responses. Mutations require the existing same-origin check and JSON content type. Strict schemas reject unknown fields, scopes, duplicate selections and missing revisions; `null` is valid only for previously absent records. Bodies are bounded to 8 KiB. A shared ten-request/account/minute budget fails closed if rate-limit storage is unavailable. These operations never call game mutation APIs.

Successful export/erase audit events contain actor, action and scope names only, not note text, snapshots, member links or exported files. Existing bounded security auditing remains independent of content retention. Route handlers stay thin; `features/personal-data/` composes the public task/privacy store operations, while each source domain owns its persistence and erasure invariant.

## Verification and troubleshooting

Run `npm test`, `npm run test:browser`, `npm run build` and `npm run test:production`, plus formatting, lint, typecheck and documentation checks. Real Redis coverage runs with `npm run test:integration` against a **disposable loopback** `TEST_REDIS_URL` or `TEST_REDIS_CLUSTER_NODES`; the harness flushes that test target. Never point it at production.

Focused API/service tests cover session ownership, request validation, unavailable limits, strict export projections and conflict handling. Real standalone/Cluster tests cover isolation, deletion/edit races, replay after new saves, absent-record fences, link revocation, retention and corruption. Browser workflows download actual JSON, erase both scopes, test another account, preserve an old editor's conflicted draft, reject uncertain writes without retries and run touch/keyboard/reduced-motion/WCAG AA checks at 320/393/412/768/1440 widths.

Running-app review evidence: [desktop](../assets/screenshots/personal-data-desktop.png) and [mobile](../assets/screenshots/personal-data-mobile.png). Exact executed suite totals and final-head CI results are recorded in PR #11's comments. Native Safari, physical devices and screen-reader products remain unverified.

If the summary cannot load, do not assume there is no saved content. Restore Redis access and explicitly reload. A corrupt record needs an authorized, careful repair rather than a forced client overwrite. If a download is blocked, check the browser's download controls. Deleted content has no undo; existing exports are private copies and are not automatically restored.

[N100 saved activity views](activity-views.md) add a separate `views` scope for configuration and planning references. It exports the versioned saved-view record and erases it through its own atomic revision fence; normal portal preferences and task notes remain unchanged. No merge or deployment is authorized by this feature.
