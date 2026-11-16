# Community seasons and the free season pass

Seasons are generated, published and archived automatically; see [automatic seasons](automatic-seasons.md) for the generation engine, personal plans and the reward economy. There is no administrator interface, so there is no season builder, moderation queue, artwork upload or manual delivery queue.

## Member experience

Open **Community → Community season** (`/seasons`). The pass includes a seasonal hero, level, independent Season XP, next-level progress, a horizontally scrollable reward track, challenge paths, review status and community milestones. `/seasons/challenges` filters by path, cadence and status. `/seasons/history` preserves prior results, submissions, XP events and claimed rewards. Rewards are free; there is no premium track, purchase, financial balance or casino progression.

Cosmetics include badges, banners, titles, decorations and achievement marks. Claim eligibility is checked on the server. Claimed definitions are copied into permanent ownership records. Equipment is independently saved per cosmetic category and displayed on Character, including after the original season leaves the first history page. Claim and equip requests derive ownership only from the session. A later XP correction does not silently revoke an owned cosmetic.

## XP, fairness and evidence

XP thresholds are cumulative integers beginning at zero and strictly increasing, with 100 levels. Season XP never changes game XP, Solaris, House Credits, inventory or the casino wallet. Every path, including solo, can independently reach the last level; no PvP, guild or paid requirement exists.

Only API-observed evidence counts: new game XP, new character levels and newly completed journey nodes, measured against an immutable per-season baseline with canonical pawn and controller IDs. Client claims, text and screenshots are never evidence, and nothing is approved by a person.

## Persistent Redis schema

All season keys use `arrakis:{seasons}:v1:`. The shared hash tag lets publication, progression, moderation, aggregate milestones, reward claims and equipment commit in one Cluster slot. This prioritizes consistency; season traffic is concentrated on one shard. Do not add `SELECT` commands. Redis must use persistent storage/backups and a deployment eviction policy that protects authoritative application data.

| Suffix                                          | Purpose                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `season:<id>`                                   | Versioned definition, phase, UUID revision and publication timestamps               |
| `schedules` / `schedule-revision`               | Upcoming windows and publication CAS guard                                          |
| `unique:slug:<slug>` / `unique:number:<number>` | Permanent published identity reservations                                           |
| `progress:<season>:<account>`                   | Exact XP, append-only events, submissions, copied claims and equipment references   |
| `equipment:<account>`                           | Equipped cosmetic snapshots, independent of history pagination                      |
| `totals:<season>`                               | Atomic participant, completion, XP and claim totals                                 |
| `inbox:<season>` / `inbox-index:<season>`       | Private pending evidence records and bounded review-page index                      |
| `deliveries:<season>`                           | Reviewed, versioned game deliveries and permanent execution/reconciliation outcomes |
| `audit:<season>`                                | Permanent append-only operation history; latest 100 displayed                       |
| `artwork:<sha256>`                              | Immutable normalized image, dimensions and bounded base64 bytes                     |
| `artwork-index:<season>`                        | At most 128 distinct uploaded image references                                      |
| `presentation:<season>:<revision>`              | Permanent before/after live-edit snapshot with actor, reason and timestamp          |

No season history, ownership or audit key expires automatically. Per-member records are capped at 1 MiB, 1,200 submissions and 1,250 XP events. Definitions allow 100 challenges, 100 rewards, 20 milestones and at most 1,000 theoretically possible challenge completions per member. Exceeding a bound fails visibly rather than evicting history. Each recurring challenge allows up to 20 completions per period. Up to 100 future published schedules and 100 delivery proposals per season are supported; historical seasons are retained without a total season cap. Member history reads 25 seasons per page and review reads 50 submissions per page.

The Lua commit validates key types, expected raw records and deadlines before writes, then saves changed records, queue indexes and the audit event atomically. Concurrent writes return a conflict; the UI asks the user to refresh. No uncertain mutation retries automatically. Stable claim identity, submission UUIDs and correction UUIDs make explicitly repeated terminal requests harmless. Redis persistence and failover durability depend on the configured Redis service; application atomicity does not replace backups or replication configuration.

Season and aggregate records include optional monotonic versions, initialized on the next applicable write for older v1 records. These are additive fields, so existing stored records remain readable without a migration. Clients use the versions to discard stale community/presentation responses. The original published definition remains unchanged by the presentation overlay.

## Live community progress

The pass reads a small aggregate-only endpoint every 15 seconds while visible. It shows contributions from other members and presentation changes without reloading the page. It does not fetch private review records or another member's progression. Only one request runs at a time, with a five-second deadline. Hidden pages cancel polling; visibility resumes it. Failures retain confirmed totals, display a delayed-state message and back off to at most two minutes. The server permits 12 live reads per account/minute; extra tabs must back off. A stale response cannot replace a newer aggregate or presentation version.

Connection changes and milestone unlocks use polite live-region announcements. Passive polling does not play sounds. The existing opt-in audio manager continues to handle confirmed member actions. Reward navigation has keyboard-accessible previous/next buttons alongside native scrolling; modal dialogs retain focus, close with Escape and return focus to the activating control.

## APIs

| Route                                   | Methods | Operations                                                                    |
| --------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `/api/v2/seasons`                       | GET     | Published season pages; `?season=<id>` selects one with plan and claim states |
| `/api/v2/seasons`                       | POST    | `sync`, `verify`, `claim`, `claim-rewards`, `claim-all`, `equip`              |
| `/api/v2/seasons/<id>/artwork/<sha256>` | GET     | Authenticated WebP retrieval, with draft/reference privacy checks             |
| `/api/v2/seasons/<id>/community`        | GET     | Published phase/presentation and versioned community aggregates only          |

## In-game delivery boundary

Game rewards are delivered only when the player clicks **Claim Reward** or **Claim All Available**. The server verifies the level, the member's own verified linked character, that the character is offline and that the season is bound to that one character, then sends each component through `DUNE_API_KEY` over HTTPS or loopback HTTP. A durable marker is written before every game call; Solaris and House Credits are confirmed against exact balances and items against the Console's database receipt. Components are tracked independently, and only a never-attempted component can be retried.

An unconfirmed, partial or interrupted send is **quarantined** as `uncertain`: it is never resent, it pauses Claim All for that player, and it stays in the durable record. The `reward-recovery` worker parks interrupted sends and reports counts; it reads claim records only and never contacts the game. Claims stay open after a season ends. Character XP rewards are not offered because the Console's `add-xp` only queues a task and returns no verifiable receipt. See [background workers](../architecture/background-workers.md).

## Deployment, testing and troubleshooting

No environment variable or migration is required. Back up Redis before upgrades; season keys are namespaced under `{seasons}`. Run the standard checks (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`) and `npm run test:integration` against a disposable Redis. Unit tests cover plans, the reward economy, claims and recovery; no automated test sends anything to a live game.
