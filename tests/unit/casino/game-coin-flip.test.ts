import { describe, expect, it } from 'vitest';
import { startRound } from '../../../src/features/casino/engine/round';
import { Rng } from '../../../src/features/casino/fairness/rng';
import { verifyRound } from '../../../src/features/casino/fairness/verify';
import { COIN_PAYOUT_BPS, coinFlip } from '../../../src/features/casino/games/coin-flip';
import type { GameModule } from '../../../src/features/casino/engine/types';
import { checkInvariants } from '../../../src/features/casino/ledger/ledger';
import { build, O, S } from '../../helpers/casino-engine';

const SEED = '9'.repeat(64);
const play = (side: string, wager: bigint, nonce: number) =>
  coinFlip.start(new Rng(SEED, 'test-client', nonce), wager, coinFlip.parseParams({ side }), { now: 0 });

describe('The Great Houses (coin flip)', () => {
  it('requires a valid House', () => {
    expect(coinFlip.parseParams({ side: 'scarab' })).toEqual({ side: 'scarab' });
    for (const bad of [null, {}, { side: 'heads' }, { side: 1 }]) expect(() => coinFlip.parseParams(bad)).toThrow();
    expect(() => coinFlip.parseAction({})).toThrow();
  });

  it('pays exactly 1.96x on a win, rounding down, and nothing on a loss', () => {
    expect(COIN_PAYOUT_BPS).toBe(19_600n);
    for (let nonce = 0; nonce < 40; nonce += 1) {
      const result = play('scarab', 15n, nonce);
      const won = (result.state as { won: boolean }).won;
      expect(result.settlement!.payout).toBe(won ? 29n : 0n);
    }
    expect(
      play('crescent', 100n, 1).settlement!.payout === 196n || play('crescent', 100n, 1).settlement!.payout === 0n,
    ).toBe(true);
  });

  it('lands each side half the time and the win flag follows the chosen side', () => {
    let scarab = 0;
    const runs = 6000;
    for (let nonce = 0; nonce < runs; nonce += 1) {
      const { state } = play('scarab', 10n, nonce);
      const landed = (state as { landed: string }).landed;
      if (landed === 'scarab') scarab += 1;
      expect((state as { won: boolean }).won).toBe(landed === 'scarab');
    }
    expect(scarab / runs).toBeGreaterThan(0.47);
    expect(scarab / runs).toBeLessThan(0.53);
  });

  it('has an exact 98% return to player', () => {
    // P(win) = 1/2 and a win returns 1.96x the wager.
    expect((Number(COIN_PAYOUT_BPS) / 10_000) * 0.5).toBeCloseTo(0.98, 10);
  });

  it('plays through the engine with exact accounting and an independently verifiable result', async () => {
    const b = build(1000n, { [coinFlip.id]: coinFlip as GameModule });
    const view = await startRound(b.deps, {
      owner: O,
      server: S,
      game: coinFlip.id,
      wager: '100',
      params: { side: 'crescent' },
      idempotencyKey: 'coin-test-0001',
    });
    expect(view.status).toBe('settled');
    const won = (view.settlement!.result as { won: boolean }).won;
    expect([b.wallet().available, b.wallet().reserved]).toEqual([won ? 1096n : 900n, 0n]);
    expect(checkInvariants(b.wallet())).toEqual([]);
    const seed = b.seedOf.get(`${O}:${view.id}`)!;
    expect(
      verifyRound(
        coinFlip as GameModule,
        { ...seed, wager: 100n, params: { side: 'crescent' }, actions: [] },
        view.settlement!,
      ),
    ).toEqual({ ok: true });
  });

  it('rejects wagers outside the table limits and a missing side', async () => {
    const b = build(1000n, { [coinFlip.id]: coinFlip as GameModule });
    const base = {
      owner: O,
      server: S,
      game: coinFlip.id,
      params: { side: 'scarab' },
      idempotencyKey: 'coin-test-0002',
    };
    await expect(startRound(b.deps, { ...base, wager: '9' })).rejects.toMatchObject({ code: 'INVALID_WAGER' });
    await expect(startRound(b.deps, { ...base, wager: '100001' })).rejects.toMatchObject({ code: 'INVALID_WAGER' });
    await expect(startRound(b.deps, { ...base, wager: '10', params: {} })).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
    });
  });
});
