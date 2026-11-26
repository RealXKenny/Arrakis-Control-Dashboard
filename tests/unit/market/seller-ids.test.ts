import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));

describe('market ladder privacy', () => {
  it('removes seller player IDs from every nested row and keeps everything else', async () => {
    const { withoutSellerIds } = await import('../../../src/features/market/server/market-listings');
    const input = {
      ok: true,
      rows: [
        { owner_id: '9007199254740993', owner_type: 'player', price: '5', stock: 2 },
        { ownerId: 7, owner_type: 'bot', price: '6', nested: { owner_id: 'x', keep: true } },
      ],
    };
    expect(withoutSellerIds(input)).toEqual({
      ok: true,
      rows: [
        { owner_type: 'player', price: '5', stock: 2 },
        { owner_type: 'bot', price: '6', nested: { keep: true } },
      ],
    });
  });
});
