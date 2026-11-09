# The Solaris Exchange

Dune-themed casino for Arrakis Control. Every wager is **real in-game Solaris**: there are no demo or play-money credits. The Solaris Exchange is **closed by default**: the server refuses every deposit, withdrawal and wager unless `CASINO_SOLARIS_ENABLED=true`. See the [progress file](../development/solaris-casino-progress.md) for status and what remains.

## Money model

- One currency, `solaris`, per member and game server. Solaris reaches the casino wallet only by a deposit the Console has confirmed, and leaves it only by a confirmed withdrawal; in between it is spent and won at the tables. There is no operation that creates balance from nothing.
- Storage is Redis only. Each account is a set of keys sharing a `{casino:<owner>:<server>}` hash tag, and every ledger change is one Lua script, so it is atomic on standalone Redis and single-slot on Cluster.
- Amounts are exact integers (decimal strings on the wire). A wallet bucket is capped at 9,000,000,000,000,000 so Redis Lua doubles stay exact. A single transfer is capped at the Console's documented 1,000,000,000,000.
- The ledger is append-only, idempotent by key, and funds move through holds (reserve, release, settle).
- Table ceilings protect the house and the member: `CASINO_MAX_WAGER` (default 10,000) caps any single wager, and `CASINO_MAX_PAYOUT` (default 1,000,000) caps what one round can pay. A round that would pay more is paid the ceiling and says so in its result (`payoutCapped`); only the far tail of Mines and Crash can reach it.

## Solaris transfers

Deposits move Solaris from the member's game character to the casino wallet; withdrawals move it back. Only Solaris (`currencyId: 0`) is ever sent. The player, server and owner come from the verified session and a fresh linked-character check, never from request bodies.

### What the Console does (verified from real replies)

- `GET /api/players/{id}/currency` returns `{ capabilities, rows: [{ currency_id: 0, balance: "12533085", label: "Solari Credit" }, { currency_id: 1, ... }] }`. Solaris is currency 0 and balances are strings. The dashboard reads currency 0 only and refuses any other shape.
- `POST /api/players/{id}/add-currency` with `{ currencyId: 0, amount, confirmation: "ADD CURRENCY" }` replies `{ supported, backupCreated, result: { ok, player: { onlineStatus }, currencyId, amount, balance: { balance }, message } }`.
- The change is **written to the database and loaded when the player next joins**. If the player is online, their live session could overwrite it, destroying or duplicating Solaris. So the character must be **offline**:
  - a transfer is refused unless a fresh check says the character is `Offline` (anything unclear counts as online);
  - an adjustment counts as applied only if the Console's reply names Solaris and the exact amount, says the player was `Offline` when it was written, and reports exactly the balance expected (`balance before + change`). Anything else is parked for an administrator.
- Still not known: transaction IDs, idempotency keys, a way to query a past adjustment, and the exact error codes. The reply's after-balance lets a transfer be verified without them, but the client treats every unclear outcome as uncertain.

### States

| State                  | Meaning                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `created`              | Nothing was sent. Safe to resume.                                                      |
| `debit_sent`           | Deposit: the `-amount` adjustment was sent (or about to be); outcome not yet known.    |
| `credit_sent`          | Withdrawal: the `+amount` adjustment was sent (or about to be); outcome not yet known. |
| `game_applied`         | The Console confirmed it. Only idempotent wallet steps remain and are retried.         |
| `needs_reconciliation` | Outcome unknown. Never retried automatically; an administrator resolves it.            |
| `completed` / `failed` | Terminal.                                                                              |

Rules:

1. The state is advanced with compare-and-set before the Console is called, so concurrent requests cannot both send the adjustment.
2. Both directions read the game balance first. Only an explicit Console refusal (HTTP 400, 401, 403, 404, 409, 422) counts as "nothing happened". Timeouts, network errors, 5xx and replies that fail verification are uncertain.
3. A withdrawal's funds stay reserved (unavailable) until it completes or provably fails.
4. Reconciliation is a human decision: an administrator (fresh sign-in required) compares the player's real balance with what the transfer should have done and marks it `applied` or `not_applied`, with a note, at `/casino/admin`. Each resolution is audited.
5. A withdrawal appears in the game the next time the member joins.

## Provably fair randomness

Each account has a server seed (secret), a client seed (the player may change it), and a nonce that counts rounds. Before any round uses a server seed, its commitment `SHA256(serverSeed)` is stored and shown to the player.

- Random stream: `block(i) = HMAC_SHA256(key = serverSeed hex string, message = "<clientSeed>:<nonce>:<i>")`, concatenated for i = 0, 1, 2, and so on.
- Integers `int(n)`: read 4 bytes big-endian and discard any draw at or above `2^32 - (2^32 mod n)` (rejection sampling), then take it modulo `n`. This is exactly uniform; there is no modulo bias.
- Floats: 6 bytes as a 48-bit integer divided by `2^48`.
- Shuffles: Fisher-Yates from the end, `for i = n-1 down to 1: swap a[i] with a[int(i + 1)]`.
- Payouts use integer basis points, `floor(wager * bps / 10000)`, so fractions round in the house's favour.

A seed is revealed only when it is rotated. Rotation is refused while any round is open, so a seed that protects hidden state (a Mines board, a Blackjack shoe, a Crash point) can never be revealed mid-round. After rotation anyone can check that the revealed seed matches the commitment and replay `start` plus the recorded actions to reproduce the settlement. Games are labelled "provably fair" only when that replay is implemented and tested for them.

## Round engine

Every game is a pure module (`engine/types.ts`): `start` takes the seeded random stream, `act` is deterministic, and `view` must hide unrevealed state. The browser only submits actions.

`reserving`, then `open`, then `settling`, then `settled`; `voided` refunds every hold. Each stored change is a version-checked compare-and-set, ledger keys derive from the round id, and seed allocation is idempotent per round, so a crash at any point is recoverable by the recovery sweep (settle what is settling, finish interrupted double-down or split holds, refund setup that never completed, and refund rounds abandoned for 24 hours). Extra holds (double down, split) are recorded as a pending action before the funds are reserved, so a concurrent or interrupted request can neither lose nor confiscate them. Every wager is a hold on the member's real Solaris wallet balance.

## Games

All games below are played with real Solaris from the casino wallet. Wagers and payouts are whole units; fractions round down. Table minimums are listed per game; the largest wager is the lower of the game's maximum and `CASINO_MAX_WAGER`.

### The Great Houses (coin flip)

Pick a House symbol (scarab or crescent), then wager 10 to 100,000. A fair coin lands on each side with probability exactly 1/2, taken as `int(2)` from the seeded stream. A win pays 1.96x (19,600 basis points), so the return to player is 98% and the house edge is 2%. Verification: replay with the revealed server seed, the round's client seed and nonce.

### The Emperor's Hand (Blackjack)

Wager 10 to 50,000.

- 6 decks, freshly shuffled for every round from the committed seed.
- Deal order: player, dealer up card, player, dealer hole card. The dealer checks for blackjack when showing an ace or ten-value card.
- The dealer stands on all 17s, including soft 17.
- Blackjack pays 3:2 rounded down. Both blackjack is a push. A 21 made any other way, including after a split, pays 1:1.
- Double down on any first two cards, also after a split (not split aces): one card, then the hand stands.
- Split two cards of the same rank once (no re-split). Split aces get one card each and stand.
- No insurance and no surrender.
- The shoe and the dealer's hole card are never sent to the browser while the round is open. The full action list is stored with the round, so after the seed is retired anyone can replay it.
- A double down or split reserves an extra wager first. If that reservation is interrupted, the round recovers it; a round abandoned for 24 hours is refunded.

### The Spice Wheel (European Roulette)

Single-zero wheel, pockets 0 to 36, each with probability exactly 1/37. You may place 1 to 20 bets on one spin; the round's wager (10 to 100,000) is the sum of the bets and is checked before any funds are reserved.

| Bet      | Wins on                                        | Pays |
| -------- | ---------------------------------------------- | ---- |
| Straight | the single number (0 to 36)                    | 35:1 |
| Color    | red or black                                   | 1:1  |
| Parity   | odd or even                                    | 1:1  |
| Range    | low (1 to 18) or high (19 to 36)               | 1:1  |
| Dozen    | 1 to 12, 13 to 24 or 25 to 36                  | 2:1  |
| Column   | numbers where `n mod 3` is 1, 2 or 0 (1 to 36) | 2:1  |

Zero loses every outside bet (no en prison or la partage). Every bet type returns 36/37 (about 97.30%), a house edge of about 2.70%, and all payouts are whole multiples of the stake. The wheel animation only displays the server's number.

### Fate of Arrakis (Dice)

The roll is an integer 0 to 9,999 shown as 0.00 to 99.99, each with probability 1/10,000. Roll under a target wins when the roll is below it; roll over wins when the roll is above it; landing exactly on the target loses. The chance must be between 1% and 98%.

Multiplier = 0.99 / chance, rounded down to basis points (50% pays 1.98x, 1% pays 99x, 98% pays about 1.0102x), so the return to player is between 98.99% and 99%. Wager 100 to 100,000. At very small stakes on high-chance bets the rounded payout can equal the stake, which is why the table minimum is 100.

### Spice Harvest (Mines)

A 5 x 5 desert section. Choose 1 to 24 hazards (sandworm activity) and a wager of 10 to 100,000. The server places the hazards with an unbiased draw from the committed seed and keeps them server-side: they are not in any API response, browser state or client bundle until the round ends. Reveal tiles one at a time; each safe tile (a spice cache) raises the multiplier, a hazard ends the round and loses the wager. Cash out after at least one safe reveal. Clearing every safe tile cashes out automatically.

After `k` safe reveals with `h` hazards the multiplier is `0.99 * prod_{i<k} (25 - i) / (25 - h - i)`, rounded down to basis points (for example 3 hazards, 1 reveal: 1.1250x). Cashing out after any number of reveals returns between 98.99% and 99% on average.

### Ornithopter Run (Crash)

An ornithopter outruns a Coriolis storm. The multiplier rises along a fixed curve, 0.5% every 50 ms (about 2.7x after 10 seconds), until the storm catches it. Cash out first to win `wager * multiplier`; wager 10 to 100,000.

The crash point is fixed from the committed seed when the round starts and hidden until it ends: `crash = floor(9900 * 1,000,000 / (1,000,000 - u))` basis points, where `u` is a uniform integer below 1,000,000. This gives `P(crash >= m) = 0.99 / m` for every target, so any cash-out strategy returns 99% on average. About 1% of flights crash instantly. The crash point is capped at 1,000x, and a flight still alive at the cap cashes out automatically at 1,000x.

Timing is entirely server-side. The multiplier is computed from the server clock between the start of the round and the moment your cash-out arrives; browser clocks, frame rates and any timestamp you send are ignored (the server overwrites it). When the crash time passes, the server settles the round as a loss by itself, whether or not you act or look at it. Rounds are individual (not shared). Under `prefers-reduced-motion` the flight is shown as a number that updates once a second.

## Pages and API

Signed-in members use these pages (each calls `requireSession()`): `/casino` (lobby), `/casino/games/<game>`, `/casino/wallet` (balance, deposit and withdrawal, breaks, ledger), `/casino/history`, `/casino/fairness` and `/casino/rules`. Administrators also see `/casino/admin` (transfers to reconcile); everyone else gets a 404 there. The navigation has one Casino menu with these entries.

The browser talks to `/api/v2/casino/*`, built on the shared `route()` wrapper (same-origin mutation check, session, bounded strict JSON, no-store responses):

| Route                       | Purpose                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /wallet`               | Balance, limits and whether play is enabled (ledger entries with `?entries=1`). Read-only  |
| `GET/POST /transfers`       | Your transfers; start a `deposit` or `withdrawal` with `amount` and `idempotencyKey`       |
| `GET/POST /rounds`          | Your recent rounds (`?status=open` for unfinished); start a round                          |
| `GET /rounds/[id]`          | A round's current view (settles a crashed flight if its time has passed)                   |
| `POST /rounds/[id]/action`  | One player action for an open round                                                        |
| `GET/POST /fairness`        | Public seed state; rotate the seed or set a client seed                                    |
| `GET /verify?round=<id>`    | Verification inputs for one of your finished rounds, once its seed is retired              |
| `GET/POST /limits`          | Voluntary break                                                                            |
| `GET/POST /admin/transfers` | Administrators only: list uncertain transfers; record what really happened (fresh sign-in) |

The owner is always the signed-in member. Request bodies may not name an owner, currency, balance, server or player: unknown fields are rejected, and there is no route that credits a wallet. Starting a round is limited to 40 per minute, transfers to 10, actions to 180, and a repeated idempotency key returns the original result instead of repeating it.

## Responsible play

- Real Solaris is at stake and every table says so. Odds, house edges and rules are published for every table.
- A voluntary break (1 hour, 24 hours, 7 days or 30 days) blocks new rounds but never withdrawals. It can be extended but never shortened.
- An optional 30-minute reminder is stored only in the member's browser and is off by default.
- Results are announced to assistive technology and animations are disabled under `prefers-reduced-motion`. There are no near-miss effects, streak bonuses or fake activity.
- Unfinished rounds resume after a reload; one left for 24 hours is played out by the game's own rule (Blackjack stands, Mines banks), or refunded if the player had learned nothing.
- Wager and payout ceilings (`CASINO_MAX_WAGER`, `CASINO_MAX_PAYOUT`) and a cap of 5 unfinished rounds limit exposure.

## Security review

| Threat                               | Control                                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acting as another member             | The owner always comes from the verified session. Other members' rounds, ledgers, transfers and seeds do not exist under your keys.                 |
| Forged identity, currency or balance | Request bodies are strict: unknown fields are rejected. No route accepts an owner, player, currency or amount to credit.                            |
| Cross-site requests                  | Same-origin check on every mutation, session required on every route, `no-store` responses, bounded JSON bodies.                                    |
| Changing an outcome                  | Outcomes come from the committed seed on the server. The browser sends actions only. Timed games use the server clock and overwrite client times.   |
| Reading hidden state early           | The Mines board, Blackjack shoe and Crash point are not in open-round views, history rows or verification until the round and its seed are retired. |
| Double spending or double settling   | Ledger keys derive from the round id, every change is a compare-and-set, reserved funds cannot be spent, and settlement is idempotent.              |
| Walking away from a bad hand         | An abandoned round is played out by the game's rule, and only refunded when nothing was learned.                                                    |
| Resource exhaustion                  | Rate limits per member, at most 5 open rounds, bounded bodies, bounded histories, and recovery sweeps that isolate failures and read every page.    |
| Leaking a live server seed           | Rotation is refused while any round is open; only retired seeds are ever returned.                                                                  |
| Duplicating or destroying Solaris    | Transfers require an offline character (fresh check) and are verified against the Console reply: Solaris, exact amount, Offline, exact balance.     |
| Unclear Console outcomes             | Never retried. Parked for an administrator, who must have signed in recently; funds stay reserved or uncredited until resolved.                     |
| Unauthorised play                    | The server switch (`CASINO_SOLARIS_ENABLED`, default off) is checked on every wager and transfer.                                                   |
| Untraceable events                   | Transfers, reconciliations, breaks, seed rotations, voided or abandoned rounds and recovery failures go to the audit trail.                         |

### Residual risks and what is not verified

- The Redis scripts were checked against an independent model of the ledger rules in an emulator (24,000 random operations, all error paths, no differences), and the browser tests run an in-memory emulation of them. They have **not** run on a real Redis, and atomicity under concurrent connections and in Cluster is unproven until `npm run test:integration` passes against a disposable Redis.
- The transfer flow was run against a fake Console that mimics the replies the operator supplied. It has not been run against the real Console. Test a small deposit and withdrawal on a non-production server first.
- A player who logs in between the offline check and the Console write is caught by the Console reply (`onlineStatus` must be `Offline`) and parked, but that depends on the real Console reporting status honestly.
- Crash relies on the application server clock. With several instances their clocks should be NTP-synchronised.
- The open-round cap is checked before the round starts, so a burst of simultaneous starts can briefly exceed it.

### Before enabling real Solaris play

Setting `CASINO_SOLARIS_ENABLED=true` puts real in-game currency at stake. Do it only when all of these are true: you have legal advice for your jurisdictions and the age and access controls they require; the game publisher's and your hosting provider's policies allow it; a small deposit and withdrawal have been tried against the real Console on a test server; `npm run test:integration` passes on real Redis (standalone and Cluster, as you deploy); wager and payout ceilings suit your economy; an administrator knows how to use `/casino/admin`; and an external security review is done.

## Verification status

Unit tests cover the ledger, the random stream and its uniformity, the round engine (hidden state, double-down holds, crash recovery, duplicate settlement, replay verification), the transfer failure matrix (rejection, uncertainty, crash after game confirmation, replay, concurrency, reconciliation) and the Console gateway classification with mocks. The Redis scripts (wallet, transfers, seeds, rounds) have an opt-in integration suite (`npm run test:integration` against a disposable Redis). The browser suite (`tests/browser/casino.spec.ts`, 19 tests) plays every table, deposits and withdraws, refuses an online character, parks an unconfirmed transfer, and checks phone widths, reduced motion and the menu against the production build.
