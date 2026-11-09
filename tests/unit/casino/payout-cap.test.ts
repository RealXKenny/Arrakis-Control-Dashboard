import { describe, expect, it } from 'vitest';
import { startRound } from '../../../src/features/casino/engine/round';
import type { GameModule } from '../../../src/features/casino/engine/types';
import { verifyRound } from '../../../src/features/casino/fairness/verify';
import { coinFlip } from '../../../src/features/casino/games/coin-flip';
import { checkInvariants } from '../../../src/features/casino/ledger/ledger';
import { build, O, S } from '../../helpers/casino-engine';

const games = { [coinFlip.id]: coinFlip as GameModule };
const params = { side: 'scarab' };

/** Play coin flips until one wins (and, separately, one loses), returning the round id. */
async function play(b: ReturnType<typeof build>, wantWin: boolean, tag: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const view = await startRound(b.deps, {
      owner: O,
      server: S,
      game: coinFlip.id,
      wager: '100',
      params,
      idempotencyKey: `cap-${tag}-${String(attempt).padStart(3, '0')}`,
    });
    if ((view.settlement!.result as { won: boolean }).won === wantWin) return view;
  }
  throw new Error('no such round');
}

describe('the per-round payout ceiling', () => {
  it('leaves payouts under the ceiling exactly as the game computed them', async () => {
    const b = build(1_000_000n, games, 1_000n);
    const view = await play(b, true, 'under');
    expect(view.settlement!.payout).toBe('196');
    expect(view.settlement!.result).not.toHaveProperty('payoutCapped');
  });

  it('clips a win to the ceiling, says so in the result, credits only the capped amount, and still verifies', async () => {
    const b = build(1_000_000n, games, 150n);
    const before = b.wallet().available;
    const view = await play(b, true, 'over');
    expect(view.settlement!.payout).toBe('150');
    expect(view.settlement!.result).toMatchObject({ won: true, payoutCapped: true });
    const record = b.rounds.get(`${O}:${view.id}`)!;
    expect(b.wallet().reserved).toBe(0n);
    expect(checkInvariants(b.wallet())).toEqual([]);
    expect(b.wallet().available).toBeGreaterThan(before - 100n * 200n); // sanity: balances moved by whole rounds only
    const seed = b.seedOf.get(`${O}:${view.id}`)!;
    const inputs = { ...seed, wager: 100n, params, actions: record.actions, startedAt: record.createdAt };
    expect(verifyRound(coinFlip as GameModule, inputs, record.settlement!)).toEqual({ ok: true });
    // A capped record cannot hide an overpayment: more than the replayed payout is a mismatch.
    expect(verifyRound(coinFlip as GameModule, inputs, { ...record.settlement!, payout: '197' })).toEqual({
      ok: false,
      reason: 'PAYOUT_MISMATCH',
    });
    // Nor can an uncapped record claim less than the game computed.
    const { payoutCapped: _flag, ...plain } = record.settlement!.result;
    expect(verifyRound(coinFlip as GameModule, inputs, { payout: '150', result: plain })).toEqual({
      ok: false,
      reason: 'PAYOUT_MISMATCH',
    });
  });

  it('never touches a loss', async () => {
    const b = build(1_000_000n, games, 1n);
    const view = await play(b, false, 'loss');
    expect(view.settlement!.payout).toBe('0');
    expect(view.settlement!.result).not.toHaveProperty('payoutCapped');
  });
});
