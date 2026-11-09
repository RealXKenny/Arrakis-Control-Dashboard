import { describe, expect, it } from 'vitest';
import { actOnRound, recoverRounds, startRound } from '../../../src/features/casino/engine/round';
import type { GameModule } from '../../../src/features/casino/engine/types';
import { Rng } from '../../../src/features/casino/fairness/rng';
import { verifyRound } from '../../../src/features/casino/fairness/verify';
import {
  blackjack,
  blackjackFromShoe,
  handValue,
  legalActions,
  type BlackjackAction,
  type BlackjackState,
} from '../../../src/features/casino/games/blackjack';
import { checkInvariants } from '../../../src/features/casino/ledger/ledger';
import { build, O, S } from '../../helpers/casino-engine';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
/** Build a shoe from rank names in deal order: player, dealer up, player, dealer hole, then draws. */
const shoe = (...ranks: string[]) =>
  [...ranks.map((r) => RANKS.indexOf(r)), ...Array(60).fill(RANKS.indexOf('2'))].slice(0, 60);
const act = (state: BlackjackState, type: BlackjackAction['type']) => blackjack.act(state, { type });
const payout = (r: { settlement?: { payout: bigint } }) => r.settlement?.payout;

describe('hand values', () => {
  it('counts aces as 1 or 11 and reports softness', () => {
    const v = (...r: string[]) => handValue(r.map((x) => RANKS.indexOf(x)));
    expect(v('A', 'K')).toEqual({ total: 21, soft: true });
    expect(v('A', 'A', '9')).toEqual({ total: 21, soft: true });
    expect(v('A', 'A', 'K')).toEqual({ total: 12, soft: false });
    expect(v('A', '6', 'K')).toEqual({ total: 17, soft: false });
    expect(v('10', '6', '9')).toEqual({ total: 25, soft: false });
    expect(v('K', 'Q')).toEqual({ total: 20, soft: false });
  });
});

describe('naturals', () => {
  it('pays 3:2 rounded down and does not make the dealer play', () => {
    const r = blackjackFromShoe(shoe('A', '9', 'K', '7'), 15n);
    expect(payout(r)).toBe(37n); // 15 * 5 / 2 = 37.5 -> 37
    expect(blackjackFromShoe(shoe('A', '9', 'K', '7'), 10n).settlement!.payout).toBe(25n);
    expect(r.state.dealer).toHaveLength(2);
    expect(r.state.over).toBe(true);
  });
  it('is a push when both have blackjack, and a loss against a dealer blackjack', () => {
    expect(payout(blackjackFromShoe(shoe('A', 'A', 'K', 'K'), 10n))).toBe(10n);
    expect(payout(blackjackFromShoe(shoe('K', 'A', 'Q', 'K'), 10n))).toBe(0n); // dealer up ace, hole king
    expect(payout(blackjackFromShoe(shoe('9', 'K', '8', 'A'), 10n))).toBe(0n); // dealer up king, hole ace
  });
});

describe('player turn and dealer rules', () => {
  it('player stands, dealer draws to 17 or more and the higher hand wins 1:1', () => {
    const start = blackjackFromShoe(shoe('K', '6', '9', 'K', '2', '2'), 10n); // player 19, dealer 16
    expect(start.settlement).toBeUndefined();
    const end = act(start.state, 'stand');
    expect(end.state.dealer).toHaveLength(3); // drew a 2 -> 18
    expect(payout(end)).toBe(20n);
    expect((end.settlement!.result as { dealerTotal: number }).dealerTotal).toBe(18);
  });
  it('dealer stands on soft 17', () => {
    const end = act(blackjackFromShoe(shoe('K', 'A', '8', '6'), 10n).state, 'stand'); // dealer A+6 = soft 17
    expect(end.state.dealer).toHaveLength(2);
    expect(payout(end)).toBe(20n); // player 18 beats 17
  });
  it('dealer bust pays the player', () => {
    // dealer 6+10 = 16, draws a king -> 26
    const end = act(blackjackFromShoe(shoe('K', '6', '8', '10', 'K'), 10n).state, 'stand');
    expect(payout(end)).toBe(20n);
  });
  it('push on equal totals and loss on lower', () => {
    expect(payout(act(blackjackFromShoe(shoe('K', 'K', 'Q', 'Q'), 10n).state, 'stand'))).toBe(10n);
    expect(payout(act(blackjackFromShoe(shoe('K', 'K', '8', 'Q'), 10n).state, 'stand'))).toBe(0n);
  });
  it('a bust ends the round at once without dealer play', () => {
    const end = act(blackjackFromShoe(shoe('K', '6', '6', '5', 'K'), 10n).state, 'hit'); // 16 + K
    expect(payout(end)).toBe(0n);
    expect(end.state.dealer).toHaveLength(2);
    expect((end.settlement!.result as { hands: Array<{ outcome: string }> }).hands[0]!.outcome).toBe('bust');
  });
  it('reaching 21 on a hit stands automatically; 21 is 1:1, not 3:2', () => {
    const end = act(blackjackFromShoe(shoe('5', '6', '6', '10', '10', '7'), 10n).state, 'hit'); // 11 + 10 = 21; dealer 16 draws 7 -> bust? 6+10+... see below
    expect(end.settlement).toBeDefined();
    expect(payout(end)).toBe(20n);
  });
});

describe('double down', () => {
  it('doubles the bet, draws exactly one card, requests an extra hold, and pays on the doubled stake', () => {
    const start = blackjackFromShoe(shoe('5', '6', '6', 'K', 'K', '10'), 10n); // player 11, dealer 16
    expect(legalActions(start.state)).toContain('double');
    const end = act(start.state, 'double');
    expect(end.additionalWager).toBe(10n);
    expect(end.state.hands[0]!.cards).toHaveLength(3);
    expect(end.settlement).toBeDefined(); // 21 vs dealer 16 -> dealer draws 10 -> bust
    expect(payout(end)).toBe(40n);
  });
  it('is not available with three cards', () => {
    const start = blackjackFromShoe(shoe('2', '6', '3', 'K', '2', '3'), 10n);
    const hit = act(start.state, 'hit');
    expect(legalActions(hit.state)).not.toContain('double');
    expect(() => act(hit.state, 'double')).toThrow();
  });
});

describe('split', () => {
  it('splits a pair once into two hands, each with a second card, and asks for a second hold', () => {
    const start = blackjackFromShoe(shoe('8', '6', '8', 'K', '3', '2', '10'), 10n);
    expect(legalActions(start.state)).toContain('split');
    const split = act(start.state, 'split');
    expect(split.additionalWager).toBe(10n);
    expect(split.state.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(split.state.active).toBe(0);
    expect(legalActions(split.state)).not.toContain('split'); // no re-split
  });
  it('plays each hand in turn and settles both against the dealer', () => {
    const start = blackjackFromShoe(shoe('8', '6', '8', 'K', '3', 'K', '10', '2'), 10n); // hands: 8+3, 8+K ; dealer 16
    const split = act(start.state, 'split');
    expect(split.settlement).toBeUndefined();
    const first = act(split.state, 'hit'); // 8+3+10 = 21 -> done
    expect(first.state.active).toBe(1);
    const end = act(first.state, 'stand'); // 18 vs dealer 16 draws 2 -> 18 (push)
    const hands = (end.settlement!.result as { hands: Array<{ outcome: string; payout: string }> }).hands;
    expect(hands.map((h) => h.outcome)).toEqual(['win', 'push']);
    expect(payout(end)).toBe(30n);
  });
  it('split aces receive one card each and stand; 21 after a split is not a blackjack', () => {
    const end = act(blackjackFromShoe(shoe('A', '6', 'A', 'K', 'K', '5', '3'), 10n).state, 'split'); // A+K = 21, A+5 = 16; dealer 16 draws 3 = 19
    expect(end.settlement).toBeDefined();
    const hands = (end.settlement!.result as { hands: Array<{ outcome: string; payout: string }> }).hands;
    expect(hands.map((h) => [h.outcome, h.payout])).toEqual([
      ['win', '20'], // 1:1, not 3:2
      ['lose', '0'],
    ]);
  });
  it('requires equal rank: a king and a queen cannot split', () => {
    const start = blackjackFromShoe(shoe('K', '6', 'Q', '9'), 10n);
    expect(legalActions(start.state)).not.toContain('split');
    expect(() => act(start.state, 'split')).toThrow();
  });
  it('allows double down after split on non-aces', () => {
    const split = act(blackjackFromShoe(shoe('8', '6', '8', 'K', '3', '3'), 10n).state, 'split'); // 8+3 and 8+3
    expect(legalActions(split.state)).toContain('double');
  });
});

describe('information hiding and validation', () => {
  it('never exposes the shoe or the hole card while the round is open', () => {
    const start = blackjackFromShoe(shoe('K', '6', '9', 'Q'), 10n);
    const open = blackjack.view(start.state, false, 0) as {
      dealer: number[];
      dealerHidden: boolean;
      dealerTotal: number | null;
    };
    expect(open.dealer).toHaveLength(1);
    expect(open.dealerHidden).toBe(true);
    expect(open.dealerTotal).toBeNull();
    expect(JSON.stringify(open)).not.toContain('shoe');
    const done = blackjack.view(act(start.state, 'stand').state, true, 0) as { dealer: number[]; actions: string[] };
    expect(done.dealer.length).toBeGreaterThanOrEqual(2);
    expect(done.actions).toEqual([]);
  });
  it('rejects unknown actions and does not mutate the previous state', () => {
    const { state } = blackjackFromShoe(shoe('K', '6', '9', 'Q'), 10n);
    const before = JSON.stringify(state);
    expect(() => blackjack.parseAction({ type: 'surrender' })).toThrow();
    expect(() => blackjack.parseAction(null)).toThrow();
    act(state, 'stand');
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('mathematics', () => {
  it('mimic-the-dealer play returns about 94-95% (sanity check on payouts, fixed seeds)', () => {
    const seed = '7'.repeat(64);
    let wagered = 0n;
    let returned = 0n;
    for (let nonce = 0; nonce < 4000; nonce += 1) {
      let round = blackjack.start(new Rng(seed, 'sim', nonce), 10n, {}, { now: 0 });
      let state = round.state;
      let settlement = round.settlement;
      while (!settlement) {
        const hand = state.hands[state.active]!;
        const next = handValue(hand.cards).total < 17 ? 'hit' : 'stand';
        ({ state, settlement } = blackjack.act(state, { type: next }));
      }
      wagered += 10n;
      returned += settlement.payout;
    }
    const rtp = Number(returned) / Number(wagered);
    expect(rtp).toBeGreaterThan(0.9);
    expect(rtp).toBeLessThan(0.99);
  });
});

describe('through the engine', () => {
  const games = { [blackjack.id]: blackjack as GameModule };
  const base = { owner: O, server: S, game: blackjack.id, wager: '10' };

  it('plays 40 full rounds with a simple policy: money is conserved, nothing stays reserved, every round replays', async () => {
    const b = build(100_000n, games);
    let expected = 100_000n;
    for (let index = 0; index < 40; index += 1) {
      let view = await startRound(b.deps, { ...base, idempotencyKey: `bj-round-${String(index).padStart(3, '0')}` });
      const id = view.id;
      while (view.status === 'open') {
        const hand = view.game_view as {
          hands: Array<{ total: number; cards: number[] }>;
          active: number;
          actions: string[];
        };
        const current = hand.hands[hand.active]!;
        let type = current.total < 17 ? 'hit' : 'stand';
        if (hand.actions.includes('double') && current.total === 11) type = 'double';
        if (hand.actions.includes('split') && current.cards[0]! % 13 === 0) type = 'split';
        view = await actOnRound(b.deps, { owner: O, server: S, roundId: id, action: { type } });
      }
      expect(view.status).toBe('settled');
      const record = b.rounds.get(`${O}:${id}`)!;
      const bets = BigInt(record.holds) * 10n;
      expected += BigInt(view.settlement!.payout) - bets;
      const seed = b.seedOf.get(`${O}:${id}`)!;
      expect(
        verifyRound(
          blackjack as GameModule,
          { ...seed, wager: 10n, params: {}, actions: record.actions },
          view.settlement!,
        ),
      ).toEqual({ ok: true });
      expect(b.wallet().reserved).toBe(0n);
    }
    expect(b.wallet().available).toBe(expected);
    expect(checkInvariants(b.wallet())).toEqual([]);
    expect(b.open.size).toBe(0);
  });

  it('a double down interrupted at the wallet is completed by recovery without losing the extra stake', async () => {
    const b = build(100_000n, games);
    let id = '';
    for (let attempt = 0; attempt < 200 && !id; attempt += 1) {
      const view = await startRound(b.deps, {
        ...base,
        idempotencyKey: `bj-double-${String(attempt).padStart(3, '0')}`,
      });
      if (view.status === 'open' && (view.game_view as { actions: string[] }).actions.includes('double')) id = view.id;
    }
    expect(id).not.toBe('');
    b.state.failOn = '.reserve1';
    b.state.failCount = 1;
    await expect(actOnRound(b.deps, { owner: O, server: S, roundId: id, action: { type: 'double' } })).rejects.toThrow(
      'wallet down',
    );
    expect(b.rounds.get(`${O}:${id}`)!.pending).toBeDefined();
    b.state.clock += 200_000;
    await recoverRounds(b.deps);
    const record = b.rounds.get(`${O}:${id}`)!;
    expect(record.pending).toBeUndefined();
    expect(record.holds).toBe(2);
    expect(['settled', 'settling']).toContain(record.status);
    await recoverRounds(b.deps);
    expect(b.rounds.get(`${O}:${id}`)!.status).toBe('settled');
  });

  it("refuses illegal actions and any action on someone else's round", async () => {
    const b = build(100_000n, games);
    let view = await startRound(b.deps, { ...base, idempotencyKey: 'bj-illegal-001' });
    for (let attempt = 2; view.status !== 'open' && attempt < 100; attempt += 1)
      view = await startRound(b.deps, { ...base, idempotencyKey: `bj-illegal-${String(attempt).padStart(3, '0')}` });
    await expect(
      actOnRound(b.deps, { owner: O, server: S, roundId: view.id, action: { type: 'surrender' } }),
    ).rejects.toMatchObject({ code: 'INVALID_ACTION' });
    await expect(
      actOnRound(b.deps, { owner: 'user-2', server: S, roundId: view.id, action: { type: 'stand' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
