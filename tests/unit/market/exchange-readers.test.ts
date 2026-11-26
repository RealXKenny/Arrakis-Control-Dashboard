import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ request: vi.fn(), record: vi.fn() }));
vi.mock('../../../src/server/integrations/dune', () => {
  class DuneConsoleApiError extends Error {
    constructor(readonly status: number) {
      super(`Console ${status}`);
    }
  }
  return { getDuneClient: () => ({ request: state.request }), DuneConsoleApiError };
});
vi.mock('../../../src/features/market/server/planner-store', () => ({ recordPricePoint: state.record }));

import { DuneConsoleApiError } from '../../../src/server/integrations/dune';
import { LADDER_ORDER_LIMIT, normalizeLadder, readLadder } from '../../../src/features/market/server/price-ladder';
import { normalizeTrade, readTrades } from '../../../src/features/market/server/transactions';

const ConsoleError = DuneConsoleApiError as unknown as new (status: number) => Error;

beforeEach(() => {
  vi.clearAllMocks();
  state.record.mockResolvedValue('ok');
});

describe('listing ladders', () => {
  it('keeps only price, stock and classification and rejects unsafe values', () => {
    const ladder = normalizeLadder(
      {
        rows: [
          { owner_id: 'secret', owner_name: 'Trader', owner_type: 'player', stock: 2, item_price: '9007199254740993' },
          { owner_type: 'bot', stock: '4', price: 10 },
          { owner_type: 'player', stock: 1, price: 1.5 },
          { owner_type: 'player', stock: 0, price: 5 },
          { owner_type: 'player', stock: -1, price: 5 },
        ],
      },
      'now',
    );
    expect(ladder).toEqual({
      status: 'ok',
      orders: [
        { price: '9007199254740993', stock: '2', party: 'player' },
        { price: '10', stock: '4', party: 'broker' },
      ],
      rejected: 3,
      truncated: false,
      readAt: 'now',
    });
    expect(JSON.stringify(ladder)).not.toMatch(/secret|Trader/);
    expect(normalizeLadder({ nope: true }, 'now').status).toBe('unavailable');
    const many = { rows: Array.from({ length: LADDER_ORDER_LIMIT + 1 }, () => ({ price: 1, stock: 1 })) };
    expect(normalizeLadder(many, 'now')).toMatchObject({ truncated: true });
  });
  it('records an observed snapshot only for a fresh, complete, non-empty ladder', async () => {
    state.request.mockResolvedValueOnce({ rows: [{ price: '7', stock: '3', owner_type: 'player' }] });
    await readLadder('SnapshotItem', 2);
    expect(state.request).toHaveBeenCalledWith(
      'GET',
      '/api/exchange/listings?templateId=SnapshotItem&owner=all&quality=2',
      expect.anything(),
    );
    expect(state.record).toHaveBeenCalledWith('SnapshotItem', 2, expect.objectContaining({ lowest: '7', stock: '3' }));
    state.request.mockResolvedValueOnce({ rows: [] });
    await readLadder('UnknownTemplate', null);
    expect(state.record).toHaveBeenCalledTimes(1);
  });
  it('reports a safe unavailable state when the Console fails', async () => {
    state.request.mockRejectedValueOnce(new Error('socket hang up'));
    expect(await readLadder('BrokenItem', null)).toMatchObject({ status: 'unavailable' });
  });
});

describe('completed orders', () => {
  it('normalizes supported fields and never guesses missing times or amounts', () => {
    expect(
      normalizeTrade({
        created_at: '2026-11-26T01:00:00Z',
        template_id: 'Water',
        display_name: 'Water',
        quantity: 3,
        price: '9007199254740993',
        seller_id: 101,
      }),
    ).toEqual({
      at: '2026-11-26T01:00:00.000Z',
      templateId: 'Water',
      name: 'Water',
      units: '3',
      value: String(3n * 9007199254740993n),
      sellerId: '101',
    });
    expect(normalizeTrade({ quantity: 1 })).toBeNull();
    expect(normalizeTrade({ timestamp: 1_780_000_000, quantity: 1.5, total: 'lots' })).toMatchObject({
      units: null,
      value: null,
      sellerId: null,
    });
    expect(normalizeTrade({ time: '2026-11-26T01:00:00Z', owner_id: '101' })!.sellerId).toBeNull();
  });
  it('reads bounded pages and reports seller-ID support and exclusions', async () => {
    state.request.mockResolvedValueOnce({
      rows: [
        { created_at: '2026-11-26T01:00:00Z', quantity: 1, total: 5, seller_id: '101' },
        { quantity: 1, total: 5 },
      ],
      totalCount: 2,
      totals: { events: 2, units: 2, value: '10' },
    });
    const reading = await readTrades(24, 'player', 'water');
    expect(state.request).toHaveBeenCalledWith(
      'GET',
      '/api/exchange/transactions?page=0&pageSize=100&hours=24&party=player&q=water',
      expect.anything(),
    );
    expect(reading).toMatchObject({
      status: 'ok',
      coverage: { fetched: 2, excluded: 1, reported: 2, truncated: false, sellerIds: true },
      totals: { events: '2', units: '2', value: '10' },
    });
  });
  it('stops at the page limit and marks the reading truncated', async () => {
    state.request.mockImplementation(async () => ({
      rows: Array.from({ length: 100 }, () => ({ created_at: '2026-11-26T01:00:00Z', quantity: 1, total: 1 })),
      totalCount: 10_000,
    }));
    const reading = await readTrades(720, 'all', 'bulk');
    expect(state.request).toHaveBeenCalledTimes(5);
    expect(reading).toMatchObject({ status: 'ok', coverage: { fetched: 500, truncated: true, sellerIds: false } });
  });
  it('separates unsupported, denied and unavailable Consoles', async () => {
    state.request.mockRejectedValueOnce(new ConsoleError(404));
    expect((await readTrades(24, 'all', 'a')).status).toBe('unsupported');
    state.request.mockRejectedValueOnce(new ConsoleError(403));
    expect((await readTrades(24, 'all', 'b')).status).toBe('denied');
    state.request.mockRejectedValueOnce(new Error('timeout'));
    expect((await readTrades(24, 'all', 'c')).status).toBe('unavailable');
    state.request.mockResolvedValueOnce({ supported: false });
    expect((await readTrades(24, 'all', 'd')).status).toBe('unsupported');
  });
});
