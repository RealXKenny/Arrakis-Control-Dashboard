# Community seasons and the free season pass

Implementation status: under verification. See [implementation progress](../development/community-seasons-progress.md) for the acceptance gate and current limitations. The source requirements are N081–N090 in [V2 PR #8](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/8).

## Member experience

Open **More → Community season** (`/seasons`). The pass includes a seasonal hero, level, independent Season XP, next-level progress, a horizontally scrollable reward track, challenge paths, review status and community milestones. `/seasons/challenges` filters by path, cadence and status. `/seasons/history` preserves prior results, submissions, XP events and claimed rewards. Rewards are free; there is no premium track, purchase, financial balance or casino progression.

Cosmetics include badges, banners, titles, decorations and achievement marks. Claim eligibility is checked on the server. Claimed definitions are copied into permanent ownership records. Equipment is independently saved per cosmetic category and displayed on Character, including after the original season leaves the first history page. Claim and equip requests derive ownership only from the session. A later XP correction does not silently revoke an owned cosmetic.

## Season builder and lifecycle

Open **Administration → Players & community → Season management** (`/admin?tab=seasons`). Create a season from the default template or select a saved season and choose **Use as template**. Edit identity, description, artwork theme, UTC start/end instants, IANA calendar timezone, XP thresholds, rewards, challenges and milestones. Normal season management requires no code changes or deployment.

The artwork editor supports uploaded hero and reward images as well as original geometric desert motifs and three color themes. Save a draft before uploading. PNG, JPEG and WebP inputs are limited to 3 MiB, 4096px per side and 8 million pixels. Sharp decodes and re-encodes them as metadata-free WebP at up to 1600 × 900px and 256 KiB; animation, SVG and corrupt images are refused. Each season permits 128 distinct uploads. Images are content-addressed and immutable, served through authenticated same-origin routes. Draft/unreferenced images remain private to administrators; a member needs a published season reference to retrieve an image. Reward image references are copied with claims and remain usable after archive. Provide meaningful alternative text.

Evidence still uses bounded text and up to three HTTPS links; the application never downloads submitted links or evidence images. Reviewers open links separately. Existing same-origin CSP remains intact.

Save the draft before changing lifecycle state. Preview renders the member interface without granting ownership or XP. Draft and preview remain private to administrators. Publication freezes the definition, including reward requirements, challenge awards, schedules and reward artwork. Return an unpublished preview to draft or discard unsaved edits to restore its saved version. Duplicating copies content, including the current presentation, into a separate draft with a new slug and season number; update its dates before publishing.

### Safe live presentation edits

Scheduled and active seasons expose a separate **Live season presentation** form. Only subtitle, description, theme and hero artwork can change. Name, slug, number, dates, timezone, XP thresholds, challenges, milestone targets and rewards remain immutable. Every save requires a recent administrator sign-in, the current UUID revision, a meaningful reason and the exact saved season name. Redis checks the season deadline at commit time. Concurrent saves or a simultaneous end/archive cannot overwrite one another.

Each change atomically stores a permanent before/after snapshot and an audit reference. Open the season audit and choose **Inspect presentation change** to compare values. **Restore published presentation in form** prepares a rollback; saving it requires the same confirmation and creates another audited change. Ended/archived seasons reject presentation edits and new uploads. Their last saved presentation remains part of their historical record. Previously claimed cosmetics keep their original definitions and images.

Lifecycle: **draft → preview → scheduled → active → ended → archived**. Publication may also activate a draft immediately if its start is in the past. Scheduled/active/ended states derive from saved UTC instants at request time. No worker, timer lease or restart-sensitive job is required for schedule correctness. Redis checks the active window again at submission commit time. Administrators may end a season early. All pending submissions must be reviewed before archive. After ending, members retain claims and can still claim eligible rewards. Archived seasons reject new moderation; explicit XP corrections remain audited append-only events.

Lifecycle operations require typing the saved season name. Every admin mutation uses the existing verified administrator gate, per-admin budget and high-risk recent-sign-in window. Self-review of submissions and self-approval of delivery requests are refused.

## XP, fairness and evidence

XP thresholds are cumulative integers beginning at zero and strictly increasing, with 2–100 levels. XP never changes game XP, Solaris, House Credits, inventory or the casino wallet. Reaching the last threshold caps the displayed level; further approved XP remains in history without creating an unlimited reward track.

Publication checks that solo, builder, explorer, supplier and mentor paths can each independently reach the level cap. Their theoretical XP opportunities must be within 10%. Daily/weekly challenges use the season's IANA calendar timezone (weeks start Monday), including daylight-saving changes. Period caps, total submission caps and fixed published XP amounts prevent unlimited recurrence. These checks establish configured opportunities, not a guarantee that a poorly written or excessively difficult objective is fair; administrators must also review objective quality and time burden.

The only automatic verifier currently implemented is a fresh adapter-linked-character check. It requires both pawn and controller IDs and is restricted to one completion for the entire season. Map positions and inventory observations cannot prove exploration, historical delivery, mentoring or event participation. Those challenge types require moderator-reviewed text/links. Descriptions define accepted evidence; player-supplied XP is ignored. Approved submissions append one ledger event. Rejected submissions retain notes and may be resubmitted once within the same challenge period. Identical pending/approved evidence and stable submission IDs cannot award duplicate progress.

Moderation may finish after the season ends, before archive. This avoids denying timely submissions merely because review was delayed. Correction events require an exact signed integer, an operation UUID and a reason. Corrections never replace old ledger entries; balances cannot become negative. Existing claims remain owned.

## Persistent Redis schema

There are no SQL migrations or PostgreSQL dependencies. This intentionally follows the maintainer-confirmed Redis-only architecture. Version 1 is additive and lazy: no data is created until an administrator saves a season.

All season keys use `arrakis:{seasons}:v1:`. The shared hash tag lets publication, progression, moderation, aggregate milestones, reward claims and equipment commit in one Cluster slot. This prioritizes consistency; season traffic is concentrated on one shard. Do not add `SELECT` commands. Redis must use persistent storage/backups and a deployment eviction policy that protects authoritative application data.

| Suffix                                          | Purpose                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `season:<id>`                                   | Versioned definition, phase, UUID revision and publication timestamps             |
| `index` / `published`                           | Paginated newest-first draft/admin and published/member indexes                   |
| `schedules` / `schedule-revision`               | Upcoming windows and publication CAS guard                                        |
| `unique:slug:<slug>` / `unique:number:<number>` | Permanent published identity reservations                                         |
| `progress:<season>:<account>`                   | Exact XP, append-only events, submissions, copied claims and equipment references |
| `equipment:<account>`                           | Equipped cosmetic snapshots, independent of history pagination                    |
| `totals:<season>`                               | Atomic participant, completion, XP and claim totals                               |
| `inbox:<season>` / `inbox-index:<season>`       | Private pending evidence records and bounded review-page index                    |
| `deliveries:<season>`                           | Separately reviewed, non-executing game delivery proposals                        |
| `audit:<season>`                                | Permanent append-only operation history; latest 100 displayed                     |
| `artwork:<sha256>`                              | Immutable normalized image, dimensions and bounded base64 bytes                   |
| `artwork-index:<season>`                        | At most 128 distinct uploaded image references                                    |
| `presentation:<season>:<revision>`              | Permanent before/after live-edit snapshot with actor, reason and timestamp        |

No season history, ownership or audit key expires automatically. Per-member records are capped at 1 MiB, 1,200 submissions and 1,250 XP events. Definitions allow 100 challenges, 100 rewards, 20 milestones and at most 1,000 theoretically possible challenge completions per member. Exceeding a bound fails visibly rather than evicting history. Each recurring challenge allows up to 20 completions per period. Up to 100 future published schedules and 100 delivery proposals per season are supported; historical seasons are retained without a total season cap. Member history reads 25 seasons per page and review reads 50 submissions per page.

The Lua commit validates key types, expected raw records and deadlines before writes, then saves changed records, queue indexes and the audit event atomically. Concurrent writes return a conflict; the UI asks the user to refresh. No uncertain mutation retries automatically. Stable claim identity, submission UUIDs and correction UUIDs make explicitly repeated terminal requests harmless. Redis persistence and failover durability depend on the configured Redis service; application atomicity does not replace backups or replication configuration.

Season and aggregate records include optional monotonic versions, initialized on the next applicable write for older v1 records. These are additive fields, so existing stored records remain readable without a migration. Clients use the versions to discard stale community/presentation responses. The original published definition remains unchanged by the presentation overlay.

## Live community progress

The pass reads a small aggregate-only endpoint every 15 seconds while visible. It shows contributions from other members and presentation changes without reloading the page. It does not fetch private review records or another member's progression. Only one request runs at a time, with a five-second deadline. Hidden pages cancel polling; visibility resumes it. Failures retain confirmed totals, display a delayed-state message and back off to at most two minutes. The server permits 12 live reads per account/minute; extra tabs must back off. A stale response cannot replace a newer aggregate or presentation version.

Connection changes and milestone unlocks use polite live-region announcements. Passive polling does not play sounds. The existing opt-in audio manager continues to handle confirmed member actions. Reward navigation has keyboard-accessible previous/next buttons alongside native scrolling; modal dialogs retain focus, close with Escape and return focus to the activating control.

## APIs

| Route                                                       | Methods | Operations                                                                                                    |
| ----------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `/api/v2/seasons`                                           | GET     | Published season pages; `?season=<id>` selects one; `?offset=<n>` pages history                               |
| `/api/v2/seasons`                                           | POST    | `submit`, `verify`, `claim`, `equip`                                                                          |
| `/api/v2/admin/seasons`                                     | GET     | Admin definitions/template; `?season=<id>` loads reviews, totals, proposals and recent audit                  |
| `/api/v2/admin/seasons`                                     | POST    | `save`, `duplicate`, `transition`, `presentation`, `review`, `correct`, `delivery-request`, `delivery-review` |
| `/api/v2/admin/seasons/artwork?season=<id>&revision=<uuid>` | POST    | Recent-admin, same-origin bounded binary image upload                                                         |
| `/api/v2/seasons/<id>/artwork/<sha256>`                     | GET     | Authenticated WebP retrieval, with draft/reference privacy checks                                             |
| `/api/v2/seasons/<id>/community`                            | GET     | Published phase/presentation and versioned community aggregates only                                          |

All APIs use the V2 safe-error/no-store boundary. Mutations require same origin, authenticated sessions, bounded bodies and rate protection. Member input cannot select another progression owner. Admin IDs never come from parsed relay names, profile strings or request claims. Pending evidence and ballots are never exposed through community totals. The request envelope is limited to 256 KiB. Evidence is not rendered as HTML and cannot supply fetch targets for server-side requests.

## In-game delivery boundary

Administrators can propose and separately approve/reject a delivery. Review outcomes and actors are retained. Approval is review only: execution is disabled, there is no game transfer endpoint, and the queue cannot invoke Console writes. A verified integration and explicit authorization are still required before adding execution, uncertain-send reconciliation and retry/recovery states. Do not treat an approved proposal as a delivered reward. No deployment setting silently enables delivery.

## Deployment, testing and troubleshooting

Deploy through the existing Node.js/Pterodactyl process after normal checks and maintainer approval. No new environment variable or migration command is required. Back up Redis before upgrades. A rollback to older code leaves namespaced season records untouched; do not delete the namespace to roll back UI changes. Future schema revisions must preserve published definitions and copied cosmetic ownership.

Run `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, `npm run test:production`, documentation checks and `npx playwright test tests/browser/seasons.spec.ts tests/browser/seasons-cross-browser.spec.ts`. Chromium, Android touch emulation, desktop WebKit and iPhone WebKit exercise image upload/privacy, audited live edits, another account's community contribution, outage/backoff/hidden states, version protection, reduced motion, native dialogs and WCAG 2.0/2.1/2.2 AA automation. The browser tests use disposable RESP fixtures and do not prove Redis Lua semantics. Real Lua tests live in `tests/integration/redis-seasons.test.ts`; run `npm run test:integration` separately against disposable loopback standalone Redis and Redis Cluster using the existing test environment variables. Never point these tests at production: integration setup flushes the configured disposable instance.

Playwright's WebKit projects use a separate loopback HTTPS fixture with short-lived local certificates, a canonical HTTPS `APP_URL` and unmodified production CSP/origin checks. Only those test contexts ignore the fixture's self-signed certificate. CI installs WebKit and Chromium. This tests the WebKit engine and emulated device layout; it is not a physical iPhone/Samsung or VoiceOver/TalkBack certification.

If a write reports a conflict, refresh and inspect the saved state before explicitly repeating it. If admin writes request reauthentication, sign in interactively again; background role verification does not extend the high-risk window. If a season will not publish, check each path's attainable XP, dates, unique number/slug, schedule overlap and recurrence limits. Pending evidence prevents archive until reviewed. Storage failures grant no provisional XP or cosmetics.

Level distribution, per-challenge completions, per-reward claims, individual account inspection, uploaded art, safe live presentation edits, live community polling and historical reward-track browsing are available. Physical-device/screen-reader certification and live-provider staging remain unverified. Read the [acceptance report](../development/community-seasons-progress.md) for exact results. In-game delivery execution remains disabled by explicit maintainer instruction; review approval cannot execute or enable it.
