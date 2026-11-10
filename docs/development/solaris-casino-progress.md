# Solaris Exchange progress

Handoff file for the multi-session Solaris Exchange (casino) build. Update at milestones.

## Current phase

The Solaris Exchange includes six games, member HTTP routes and browser screens, real-Solaris wallet transfers, administrator reconciliation and recovery services. The production-build browser fixture exercises these flows; standalone Redis verification has passed in V2 CI. The complete integration suite now also includes real transfer persistence/orchestration and interrupted round recovery, with a disposable six-node Cluster run on every `v2` push. Consult [draft PR #8](https://github.com/RealXKenny/Arrakis-Control-Dashboard/pull/8) and its linked run logs for the current commit, result and counts. Live Console transfers, real player accounts and deployment-specific Redis authentication/TLS remain unverified; keep `CASINO_SOLARIS_ENABLED=false` until the deployment prerequisites are met.

The phase-by-phase entries below are historical build notes. Their old “not yet” statements describe that phase, not the current implementation.

## Decisions

- **Storage is Redis, not PostgreSQL.** The original brief asked for PostgreSQL; `AGENTS.md` says "Do not add PostgreSQL or another database", and `CLAUDE.md` makes `AGENTS.md` authoritative. The ledger therefore targets Redis (standalone and Cluster, hash-tagged keys, one Lua script per operation).
- **Real Solaris only (changed in Phase 9).** Demo credits were removed entirely at the owner's request. All wagers are real in-game Solaris held in the casino wallet, funded by deposit and returned by withdrawal. The server-side gate `CASINO_SOLARIS_ENABLED` (default false) is kept as the on/off switch: it was a requirement of the original brief and the owner still has to confirm legal, publisher-policy and age/access requirements. Nothing in the repo turns it on.
- **Amounts** are BigInt in memory and decimal strings on the wire (`ledger/amount.ts`). Transfers are bounded by the documented Console limit of 1,000,000,000,000.
- The reference model in `src/features/casino/ledger/ledger.ts` defines the rules; the Redis adapter must reproduce them atomically.

## Console API findings (Phase 0)

Verified from the repo (`src/features/admin/catalog.json`, `src/server/integrations/dune.ts`, `dunedocker/transport.ts`):

- `GET /api/players/{playerId}/solaris-coin` exists and `POST /api/players/{playerId}/add-currency` exists (body `currencyId`, `amount`, `confirmation`).
- Auth is `Authorization: Bearer CONSOLE_API_KEY`. The client does not retry POSTs, and any non-2xx or `ok: false` becomes `DuneConsoleApiError`.

**Not verified** (must be confirmed against a live Console before any real transfer; nothing here may be assumed):

- Response schema of the balance read and of add-currency, including whether a transaction ID is returned.
- Whether an overdraft (negative adjustment beyond balance) is rejected.
- Whether the player must be online, whether the change is immediate, and whether idempotency keys are supported.
- Whether an adjustment can be queried afterwards. If not, reconciliation can only compare balances before and after, which cannot prove one adjustment among concurrent in-game spending.

## Historical build notes

- `src/features/casino/ledger/amount.ts`, `ledger.ts`: exact amounts, append-only entries, idempotency with fingerprint conflict detection, holds (reserve/release/settle/withdrawal finalize), invariant checker.
- `tests/unit/casino/ledger.test.ts` (24 tests, incl. 500-step randomized invariants) and `wallet-store.test.ts` (5 tests, mocked Redis): passing.
- `src/features/casino/server/wallet-store.ts`: one Lua script per operation over `casinoKeys` (`{casino:owner:server}` tag), pipe-delimited entries, balance reads and paged entry list. `MAX_BALANCE` lowered to 9e15 so Lua doubles stay exact.
- `tests/integration/redis-casino.test.ts`: opt-in; replays idempotency, overspend, 20 concurrent reserves, account isolation, and a 150-step random run against the reference model. **Written but never executed.**

- Phase 2: `transfers/types.ts` (state table), `transfers/service.ts` (start/resolve/recover over ports), `server/console-gateway.ts` (Solaris-only, no POST retry, strict balance parse, rejected/uncertain classification), `server/transfer-store.ts` (Redis CAS intents + open set), `server/transfer-deps.ts` (wiring + `CASINO_SOLARIS_TRANSFERS_ENABLED` gate, default false; added to `env.ts`, `.env.example`, env docs). Docs: `docs/features/solaris-exchange.md`.
- Tests: `transfers.test.ts` (failure matrix, in-memory wallet on the reference ledger) and `console-gateway.test.ts` (mocked Console).
- Not yet written: `tests/integration` coverage for `transfer-store.ts`; admin reconciliation route/UI (service function `resolveTransfer` exists); a startup/timer call to `recoverTransfers`.

- Phase 3: `fairness/rng.ts` (HMAC-SHA256 stream, commitments, rejection sampling, shuffle/sample, bps payouts), `fairness/verify.ts` (replay + commitment check), `engine/types.ts` + `engine/round.ts` (round lifecycle, pending extra holds, recovery sweep), `server/seed-store.ts` (allocate/rotate/client seed; rotation blocked while rounds are open), `server/round-store.ts` (CAS rounds + history), `server/engine-deps.ts`, empty `games/registry.ts`. Tests: `rng.test.ts`, `round-engine.test.ts` (test games with hidden state). Integration: `redis-casino-engine.test.ts` (unrun).
- Engine API: games register in `games/registry.ts`; a game provides `parseParams`, `parseAction`, `start(rng, wager, params)`, pure `act`, and a `view` that hides unrevealed state. Settlement payout goes on hold 0; extra holds (double/split) come from `act` returning `additionalWager` (max 4 holds).
- Phase 4: `games/coin-flip.ts` (The Great Houses, 1.96x, 2% edge), `games/blackjack.ts` (The Emperor's Hand; rules in `BLACKJACK_RULES` and the docs), both registered in `games/registry.ts`. Tests: `game-coin-flip.test.ts`, `game-blackjack.test.ts` (fixed-shoe rule tests, a 4,000-round dealer-mimic sanity simulation, 40 full engine rounds with replay verification, interrupted double-down recovery). Shared harness: `tests/helpers/casino-engine.ts`.
- Phase 5: `games/roulette.ts` (The Spice Wheel; 1-20 bets, wager = sum of bets, every bet type exactly 36/37) and `games/dice.ts` (Fate of Arrakis; 0.99/chance multiplier, 1-98% chance, min wager 100). Engine gained an optional `GameModule.validate(wager, params)` run before any funds are reserved. Tests: `game-roulette.test.ts`, `game-dice.test.ts` (exhaustive payout and probability enumeration, chi-square uniformity, engine rounds with replay verification).
- Phase 6: `games/mines.ts` (Spice Harvest; 5x5, 1-24 hazards, 0.99x fair-odds multiplier, hazards withheld until the round ends) and `games/crash.ts` (Ornithopter Run; integer curve 1.005 per 50 ms, crash point `9900e6/(1e6-u)` bps capped at 1000x, server-stamped time). Engine additions (backward compatible): `GameContext` passed to `start` (round `createdAt`), optional `stamp` (server clock onto an action), optional `due` (server-owned time action applied before any player action, lazily on view/act and by `recoverRounds`), and `view(state, finished, now)`. `verifyRound` takes `startedAt`. Tests: `game-mines.test.ts`, `game-crash.test.ts` (exhaustive 1,000,000-seed crash distribution, exact multiplier bounds, controlled-clock engine rounds).
- Phase 7: service layer `server/service.ts` (owner from session only, rate limits, error mapping, demo welcome/refill policy, voluntary pause, history summaries, verification), `server/request.ts`, routes under `src/app/api/v2/casino/` (wallet, rounds, rounds/[id], rounds/[id]/action, fairness, verify, limits), navigation (Casino menu, `casino` icon), pages under `src/app/(workspace)/casino/` (lobby, games/[game], wallet, history, fairness, rules), client components in `features/casino/components/` (six tables, shared parts, wallet controls, fairness panel), `contracts.ts` (client-safe catalogue), pure `games/crash-curve.ts` and `games/dice-math.ts` shared with the browser for display only. Tests: `tests/api/casino.test.ts`, `service.test.ts`, `ui-render.test.ts`. Docs: AGENTS.md map, repository inventory, features index, `solaris-exchange.md`.
- Phase 8 (audit): fixed a free-fold exploit (abandoned rounds were refunded; now `GameModule.abandon` plays them out: Blackjack stands every hand, Mines banks, refund only when nothing was learned); recovery sweeps for rounds and transfers now isolate failures (`failed` count, audit event) and read all pages of the open set (`listOpen(offset, limit)`); 5-open-round cap per member (`MAX_OPEN_ROUNDS`, retries of an existing start are exempt); `GET /rounds?status=open` for resuming; audit events for refill, pause, seed rotation, abandonment and recovery failure. Tests: `audit-hardening.test.ts`, `service-audit.test.ts`, extra cases in `transfers.test.ts` and `tests/api/casino.test.ts`. The real Lua scripts were run in a Python Redis emulator (fakeredis + Lua, scratch environment outside the repo) against an independent ledger model: 24,000 random operations, zero differences; seed, round and transfer scripts behaved as specified. This is an emulator, not real Redis. Security section added to `solaris-exchange.md`.
- Not yet: SSE or live multi-tab updates (the UI refreshes after each action and when the tab regains focus), browser (Playwright) tests, real-browser visual/responsive/keyboard/reduced-motion verification, Solaris deposit/withdrawal screens and API routes, admin reconciliation UI, recovery timer for transfers, (done in Phase 8: per-member open-round cap).
- Previously listed as not yet: HTTP routes, SSE events, demo-credit grant policy (how players get demo credits), responsible-play limits.

- Phase 9 pivot (owner request, 2026-11-08): removed demo credits, the `grant` operation, welcome grant and refill; the only currency is `solaris`. Added `CASINO_SOLARIS_ENABLED` (renamed from `CASINO_SOLARIS_TRANSFERS_ENABLED`), `CASINO_MAX_WAGER` (10,000) and `CASINO_MAX_PAYOUT` (1,000,000, enforced in the engine with a `payoutCapped` flag that `verifyRound` understands). Routes: `GET /wallet` (read-only), `GET/POST /transfers`, `GET/POST /admin/transfers` (admin + fresh sign-in). Pages: wallet with deposit/withdraw and transfer history, `/casino/admin` reconciliation. Real Console shapes from the owner's samples: balance from `/currency` rows (currency 0, string balances); `add-currency` reply carries `onlineStatus` and the new balance; changes load on the player's next join, so transfers require an OFFLINE character and the reply must match `balance before + change` or the transfer is parked. Fixed along the way: a parser that treated `null` as Solaris (`Number(null) === 0`).
- Browser verification: `tests/browser/casino.spec.ts` (19 tests, run twice, all pass) against the production build with the fixture's in-memory emulation of the casino Redis scripts (`tests/helpers/casino-redis.mjs`) and a fake Console that mirrors the real replies. It found and fixed: balance not dropping when a wager starts, a phone-width overflow from long non-wrapping button labels and unshrinkable grids, and missing fixture scripts. Note: builds from two sessions in one working directory corrupt `.next` and cause spurious failures; build once, then run.
- Still not verified: the real Console, real Redis (standalone or Cluster), any real player.

## Historical verification snapshot

After Phase 7: `npm test` 135 files passed (1 skipped), 1,363 tests passed (32 skipped); `npm run format:check`, `npm run lint` and `tsc --noEmit` clean; `npm run build` succeeds with all casino routes; `npm run test:production` passes; `docs:check` and `docs:format:check` pass. Not run: `npm run test:browser` (Playwright), `npm run test:integration` (needs a disposable Redis), any real-browser check of the casino UI.

## Remaining verification

1. Confirm the complete standalone and disposable Cluster suites on the current reviewed source, retaining test logs and topology in the PR. Cluster coverage includes marketplace failover under live traffic, transfer restart recovery and round settlement replay.
2. Verify a small deposit/withdrawal and uncertain-outcome reconciliation against a non-production Console with an offline test character. Automated transfer tests use a fake Console port.
3. Complete deployed Redis authentication/TLS, backup/restore, proxy and host configuration checks; disposable plaintext CI clusters do not cover those settings.
4. Complete final desktop/mobile, keyboard, reduced-motion and sound-setting review, plus independent security and operational review before enabling real Solaris.

The implementation and current evidence are tracked in draft PR #8. Historical phase snapshots above are retained for context; they do not indicate an uncommitted working tree or unfinished routes, games or reconciliation screens.
