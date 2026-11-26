# Kimi handoff: season delivery and Season 1 import

Historical checkpoint: the delivery/import work described as uncommitted below was subsequently committed in `f37681d` and verified in `20242e8`. Season 1 has since been refreshed as a 100-level Redis draft with 100 rewards and 100 gameplay quests. Follow the [current progress report](community-seasons-progress.md) for current validation and remaining work; do not treat the old pending checklist below as the present repository state.

Checkpoint: November 11, 2026, America/New_York. This records the working tree at handoff; inspect the current diff and CI before continuing. Instructions below are for the next agent, not claims that pending work has completed.

## Mission and boundaries

Continue inside `D:\Arrakis-Control-Dashboard`, branch `feature/community-seasons`, on [draft PR #9](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/9).

1. Finish and validate **Solaris and item** reward delivery through the existing Dune Console API.
2. Create a fully configured, reusable Season 1 and import it into the intended Redis instance.
3. Fix CI failures, commit logical milestones, push the feature branch and update the draft PR.
4. Preserve existing functionality and unrelated changes. **Do not merge, deploy, publish a release or modify production player records.**

Read [AGENTS.md](../../AGENTS.md) and [file organization](../architecture/file-organization.md) first. Before Next.js changes, read relevant local guides under `node_modules/next/dist/docs/`. Redis is the **only persistent store**; the maintainer explicitly superseded the original PostgreSQL requirements. Do not introduce another database or unnecessary dependencies.

The latest user instruction authorizes implementing Solaris **and items**, superseding the earlier request to keep execution unavailable in the feature. Execution still defaults off; implementing it does not authorize live test grants or deployment.

## Git state: preserve the uncommitted work

Last pushed commit: `3376348fbf8a6d9f816dd0f2decc8917f88bb89a` (Linux WebKit secure-cookie fixture fix).

Previous finishing implementation: `b0618fb25ab49b9cdb4578435bd93fb4992ac789` (artwork, live management and browser coverage).

**The new game-delivery implementation is local and uncommitted.** Start with `git status --short` and `git diff`; do not reset, clean or overwrite it. `next-env.d.ts` has an unrelated/generated change and should remain excluded from feature commits. Generated `.next/`, `test-results/`, reports and TypeScript build info must not be committed.

New untracked implementation/test files at handoff:

- `src/features/seasons/server/deliveries.ts`
- `src/features/seasons/server/delivery-gateway.ts`
- `src/features/seasons/components/delivery-manager.tsx`
- `src/features/seasons/components/game-reward-fields.tsx`
- `tests/unit/seasons/deliveries.test.ts`
- `tests/unit/seasons/delivery-gateway.test.ts`

Related tracked changes are in the season contracts, engine, HTTP handlers, member/admin components, environment schema/template, README, AGENTS guidance, documentation, Playwright configuration, browser/API fixtures, season unit tests and `tests/integration/redis-seasons.test.ts`. No deployment secrets were changed, and no real game grants were sent.

## Existing PR functionality

The pushed PR already implements reusable season definitions/builders, scheduling and lifecycle, immutable published configurations, independent XP and ledger, reviewed challenge paths, permanent cosmetic claims/equipment, milestones, archives, secure raster artwork uploads, audited live presentation edits/rollback and visibility-aware community progress. Read the [feature guide](../features/community-seasons.md) and [acceptance/progress report](community-seasons-progress.md). Some progress-report sections describe historical disabled-delivery behavior; update them with the new results.

## Local delivery implementation

The draft reward editor now accepts an optional frozen `reward.gameReward`:

- Solaris: positive whole decimal string, 1–999999.
- Item: template ID, quantity 1–1000 and explicit grade 0–5.

Published definitions and claim snapshots freeze this configuration. Game delivery never credits casino wallets or changes Season XP.

Members can request delivery from a claimed reward preview and see only their own reward IDs/statuses. Administrators can also request delivery for a claimed reward with an authorization basis. The server derives member ownership from the session, verifies the original claim and captures a fresh adapter pawn/controller link. Requests deduplicate by season/account/reward, including terminal requests. The current bound is 100 permanent delivery records per season.

A separate administrator must approve. Requesters and recipients cannot approve or execute their own requests. Admin writes reuse same-origin checks, the existing administrator gate, high-risk recent sign-in and admin budget. Execution requires the current delivery UUID revision and typed `DELIVER <delivery UUID>` confirmation.

Before execution, the server verifies original reward ownership, a fresh matching pawn/controller link and an unambiguously offline character. Solaris also reads an exact string balance. Preflight failures send nothing and can be retried after correcting the condition.

Redis CAS persists `sending` **before one non-retried Console POST**. Concurrent execution and request replays cannot send again. Exact receipts produce `delivered`; unknown, partial, malformed, network, HTTP-error and broker/task-only outcomes produce `needs_reconciliation`. Interrupted sends can be recovered after two minutes into reconciliation, never into another send. Verified applied becomes `delivered`; verified not applied becomes terminal `cancelled`, with an actor, reason and confirmation. Neither resolution rearms the record. Legacy unstructured proposals remain readable/reviewable but cannot execute.

There is no shared transaction or provider idempotency guarantee across Redis and Console. Preserve this conservative at-most-once policy; do not advertise exactly-once delivery or automatically retry uncertain requests. An API success followed by a lost/conflicting Redis completion may require reconciliation.

Activation uses the new independent `SEASON_GAME_DELIVERY_ENABLED=false` server variable. Execution additionally requires `ADMIN_CONSOLE_API_KEY` and HTTPS Console transport or loopback HTTP. Member `CONSOLE_API_KEY`, adapter `ADAPTER_TOKEN` and the casino gate remain separate. Do not print or commit `.env` values.

## Verified upstream API contract

Official upstream code was inspected at RedBlink commit `480bb5f32c919cc75d7f062e5ab03009ec01a983`:

- [server.js](https://github.com/Red-Blink/dune-awakening-selfhost-docker/blob/480bb5f32c919cc75d7f062e5ab03009ec01a983/console/api/src/server.js): `giveSingleItemRoute`, `grantPlayerItem`.
- [duneDb.js](https://github.com/Red-Blink/dune-awakening-selfhost-docker/blob/480bb5f32c919cc75d7f062e5ab03009ec01a983/console/api/src/duneDb.js): `giveItemToPlayer`.

Preserve [RedBlink attribution](../../NOTICE.md). This is published-contract verification, **not live-provider staging**.

Solaris uses `GET /api/players/<pawn>/currency` and `POST /api/players/<pawn>/add-currency` with `{ currencyId: 0, amount: positiveNumber, confirmation: "ADD CURRENCY" }`. Require the exact amount, currency, expected string balance and an offline player in the receipt.

Items use `POST /api/players/<pawn>/give-item-id` with `{ itemId, quantity, quality }`. Explicit quality selects the synchronous grant path. Require `dbGiveItemToPlayer`, matching pawn/template/grade, complete inserted-stack quantity, no clamping and `requiresRelog=false`. Broker publication/tasks alone are insufficient. Grade-0 physical schematics, entitlement cosmetics and augments are unsupported. Do not invent further API capabilities.

Recipient adapter lookup uses the existing actor envelope: configured guild, `channelId: dashboard`, recipient `userId`, username, empty recipient role list and interaction metadata. Do not fabricate privileged recipient roles. The existing season linked-character verifier was also corrected from a raw string to a session-derived actor envelope.

## Validation actually completed

- Full local unit/API/architecture suite: **1,667 passed, 32 existing installer tests skipped**.
- Typecheck and lint passed.
- Production build passed with the pre-existing broad asset-path bundling warning.
- Both production smoke suites passed against local fixtures.
- Documentation link/format and source formatting checks passed before the final small test/doc refinements; rerun them before committing.
- Latest focused delivery browser run: **all four passed in 17.1 seconds**, covering Chromium, desktop WebKit, iPhone WebKit and Android emulation. This final run includes member request UI, admin approval/execution, one API write per reward, replay refusal, unchanged XP, axe checks and screenshots.
- A new real-Redis delivery concurrency/recovery integration case exists but **has not run against real Redis**.

The preceding 22-case season browser run had failures that were diagnosed:

- An artwork/live-update WebKit test advanced a fake clock while tab visibility/timing varied. It now brings the member page to front and waits for natural polling. The full season suite still needs rerunning after this correction.
- Delivery tests reused one recipient across browser projects, accumulating fixture API request counts. They now use separate recipients; the final four delivery cases passed.
- One trace was corrupted while test source changed during execution. **Do not edit test source while Playwright is running.** No running tool sessions remain at handoff.

The final delivery screenshots are under ignored `test-results/` directories, named `season-game-delivery.png`. Inspect and copy appropriate desktop/iPhone evidence into `docs/assets/screenshots/` if useful. Emulation is not physical-device or VoiceOver/TalkBack certification.

Existing sandbox restrictions can prevent OpenSSL execution, loopback Redis connections, filesystem-link fixtures and Turbopack canonical-path access. The full tests/build passed when run with the access those existing fixtures require. Do not weaken checks to bypass such failures.

## CI and real Redis status

[Pushed-head CI run](https://github.com/RealXKenny/Arrakis-Control-Dashboard/actions/runs/43095413551) was last observed **queued with no jobs assigned**. Recheck it; do not describe it as green.

Previous real Redis verification on `b0618fb` passed 171 standalone tests with four Cluster-only skips, and 175 six-node Cluster tests. Those results **predate the local delivery implementation**. Use the existing integration workflows for current verification. Integration setup flushes the configured disposable Redis; never point it at production.

## Pending: fully configured Season 1 import

The user explicitly requested a complete Season 1 imported into our Redis. **Neither the content package nor import has been completed.**

Build a polished, free Season 1 with:

- Name, subtitle, descriptions, artwork/alternative text and theme.
- Explicit timezone and sensible configurable dates.
- XP thresholds and level cap.
- Comparable solo, builder, explorer, supplier and mentor opportunities; solo must independently reach the cap.
- Clearly distinguished reviewed versus implemented API-observed objectives.
- Complete cosmetic reward track and bounded optional Solaris/item rewards.
- Item IDs verified against the actual supported catalog, never guessed IDs copied from disposable fixture examples such as `IronOre`.
- Cooperative community milestones and a reusable template for Season 2.

Create a validated content artifact/import mechanism in the appropriate existing feature, scripts or documentation location. Import through the season engine's validated operations rather than arbitrary Redis `SET` calls. Make reruns idempotent: no duplicate seasons, rewards, progression or grants.

Identify the intended Redis target before writing. Never assume `.env` points to disposable storage. If the target is ambiguous, clarify it rather than guessing. Import as a **draft** unless launch dates/publication are explicitly established. Do not overwrite a published Season 1, reset player progress, activate execution or send game rewards as part of import. Verify that the imported draft is editable and previewable through the admin dashboard.

## Resume checklist

1. Inspect the working tree and review delivery safety, privacy, bounds and failure behavior.
2. Rerun formatting, lint, typecheck, docs checks and the complete season browser suite.
3. Run broader browser regression coverage as appropriate; the pre-delivery suite had 196 cases, and the new total should be 200.
4. Verify the new delivery CAS/recovery case against disposable standalone Redis and Cluster.
5. Complete and verify the Season 1 content/import through admin preview.
6. Update the progress report, screenshots and PR description with exact current results and remaining limitations.
7. Commit/push logical milestones, inspect latest CI and fix failures without skipping or weakening required checks.
8. Keep the PR draft. Do not merge or deploy.

Continue ordinary implementation autonomously. Distinguish fixture tests and source-contract verification from live-provider staging, and never claim unexecuted checks passed.
