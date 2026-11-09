import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));
const eval_ = vi.fn();
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({ eval: eval_, command: vi.fn() }),
}));

import { applyWalletOperation, LEDGER_SCRIPT, parseEntry } from '../../../src/features/casino/server/wallet-store';

beforeEach(() => {
  eval_.mockReset();
});

describe('wallet store (no Redis)', () => {
  it('rejects unsafe owner, server, key and hold identifiers before touching Redis', async () => {
    const grant = { type: 'deposit_credit', key: 'k', amount: 1n } as const;
    await expect(applyWalletOperation('a}b', 's', 'solaris', grant)).rejects.toMatchObject({
      code: 'ACCOUNT_MISMATCH',
    });
    await expect(applyWalletOperation('a', 's|x', 'solaris', grant)).rejects.toMatchObject({
      code: 'ACCOUNT_MISMATCH',
    });
    await expect(applyWalletOperation('a', 's', 'solaris', { ...grant, key: 'a|b' })).rejects.toMatchObject({
      code: 'INVALID_OPERATION',
    });
    await expect(
      applyWalletOperation('a', 's', 'solaris', { type: 'release', key: 'k', holdId: 'x|y' }),
    ).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    expect(eval_).not.toHaveBeenCalled();
  });

  it('refuses a negative payout and over-limit transfers client-side', async () => {
    await expect(
      applyWalletOperation('a', 's', 'solaris', { type: 'settle', key: 'k', holdId: 'h', payout: -1n }),
    ).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    await expect(
      applyWalletOperation('a', 's', 'solaris', { type: 'deposit_credit', key: 'k', amount: 1_000_000_000_001n }),
    ).rejects.toThrow();
    expect(eval_).not.toHaveBeenCalled();
  });

  it('maps Lua results to entries, replays and typed errors', async () => {
    const raw = '3|tx:a:s:solaris:k|k|deposit_credit|-|100|0|100|0|abc';
    eval_
      .mockResolvedValueOnce(['OK', raw])
      .mockResolvedValueOnce(['REPLAY', raw])
      .mockResolvedValueOnce(['HOLD_CLOSED']);
    const op = { type: 'deposit_credit', key: 'k', amount: 100n } as const;
    expect(await applyWalletOperation('a', 's', 'solaris', op)).toMatchObject({ replayed: false, entry: { seq: 3 } });
    expect((await applyWalletOperation('a', 's', 'solaris', op)).replayed).toBe(true);
    await expect(applyWalletOperation('a', 's', 'solaris', op)).rejects.toMatchObject({ code: 'HOLD_CLOSED' });
  });

  it('parses entries as exact BigInts and rejects corrupt rows', () => {
    const entry = parseEntry('1|id|k|settle|h|8999999999999999|-5|8999999999999999|0|fp');
    expect(entry.availableDelta).toBe(8999999999999999n);
    expect(entry.holdId).toBe('h');
    expect(() => parseEntry('1|2|3')).toThrow();
  });

  it('keeps the Lua script free of floating-point-lossy formatting and JSON', () => {
    expect(LEDGER_SCRIPT).toContain("'%.0f'");
    expect(LEDGER_SCRIPT).not.toContain('cjson');
  });
});
