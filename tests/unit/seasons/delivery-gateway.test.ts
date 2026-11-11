import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  enabled: true,
  key: 'admin-test-key',
  url: 'https://console.test',
}));
vi.mock('../../../src/config/env', () => ({
  getServerEnv: () => ({
    LOG_LEVEL: 'INFO',
    SEASON_GAME_DELIVERY_ENABLED: mock.enabled,
    ADMIN_CONSOLE_API_KEY: mock.key,
    CONSOLE_URL: mock.url,
  }),
}));
vi.mock('../../../src/server/integrations/dune', () => ({
  DuneConsoleClient: class {
    request = mock.request;
  },
}));
import {
  confirmedGrant,
  deliveryAvailable,
  deliveryGateway,
  solarisBalance,
} from '../../../src/features/seasons/server/delivery-gateway';
const reward = { type: 'item' as const, itemId: 'IronOre', quantity: 12, quality: 0 };
function itemReceipt() {
  return {
    ok: true,
    operation: 'dbGiveItemToPlayer',
    item: { itemId: 'IronOre', quantity: 12, quality: 0 },
    result: {
      ok: true,
      playerId: '42',
      requiresRelog: false,
      clamped: false,
      given: 12,
      insertedStacks: [
        { id: '100', template_id: 'IronOre', stack_size: 10, quality_level: 0 },
        { id: '101', template_id: 'IronOre', stack_size: 2, quality_level: 0 },
      ],
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.enabled = true;
  mock.key = 'admin-test-key';
  mock.url = 'https://console.test';
});
it('requires the independent activation gate, administrator key and secure transport', () => {
  expect(deliveryAvailable()).toBe(true);
  mock.enabled = false;
  expect(deliveryAvailable()).toBe(false);
  mock.enabled = true;
  mock.key = '';
  expect(deliveryAvailable()).toBe(false);
  mock.key = 'admin';
  mock.url = 'http://public-console.test';
  expect(deliveryAvailable()).toBe(false);
  mock.url = 'http://127.0.0.1:3101';
  expect(deliveryAvailable()).toBe(true);
});
it('requires exact complete item insert receipts and rejects partial, relogged or wrong-character results', () => {
  expect(confirmedGrant(itemReceipt(), reward, '42')).toBe(true);
  const edits: ((v: ReturnType<typeof itemReceipt>) => void)[] = [
    (v) => {
      v.result.given = 11;
    },
    (v) => {
      v.result.clamped = true;
    },
    (v) => {
      v.result.playerId = '99';
    },
    (v) => {
      v.result.requiresRelog = true;
    },
    (v) => {
      v.result.insertedStacks[0].template_id = 'Other';
    },
    (v) => {
      v.result.insertedStacks[0].quality_level = 1;
    },
    (v) => {
      v.result.insertedStacks[0].stack_size = 9;
    },
    (v) => {
      v.result.insertedStacks[1].id = '100';
    },
    (v) => {
      v.operation = 'adminGiveItemId';
    },
    (v) => {
      v.result.ok = false;
    },
  ];
  for (const edit of edits) {
    const receipt = itemReceipt();
    edit(receipt);
    expect(confirmedGrant(receipt, reward, '42')).toBe(false);
  }
  for (const payload of [null, {}, { task: { status: 'queued' } }, { ok: true, published: true }])
    expect(confirmedGrant(payload, reward, '42')).toBe(false);
});
it('requires exact Solaris balance, amount, currency and offline receipt', () => {
  const solaris = { type: 'solaris' as const, amount: '100' };
  const receipt = {
    supported: true,
    result: { ok: true, player: { onlineStatus: 'Offline' }, currencyId: 0, amount: 100, balance: { balance: '1100' } },
  };
  expect(confirmedGrant(receipt, solaris, '42', 1100n)).toBe(true);
  expect(confirmedGrant(receipt, solaris, '42', 1099n)).toBe(false);
  receipt.result.player.onlineStatus = 'Online';
  expect(confirmedGrant(receipt, solaris, '42', 1100n)).toBe(false);
  expect(solarisBalance({ rows: [{ currency_id: 0, balance: '9007199254740993' }] })).toBe(9007199254740993n);
  for (const rows of [
    [],
    [{ currency_id: null, balance: '0' }],
    [{ currency_id: 0, balance: 100 }],
    [
      { currency_id: 0, balance: '1' },
      { currency_id: 0, balance: '2' },
    ],
  ])
    expect(() => solarisBalance({ rows })).toThrow();
});
it('uses only fixed item/currency endpoints and never retries a write or accepts task publication as delivery', async () => {
  mock.request.mockResolvedValueOnce(itemReceipt());
  expect(await deliveryGateway.grant('42', reward)).toBe('delivered');
  expect(mock.request).toHaveBeenCalledWith('POST', '/api/players/42/give-item-id', {
    body: { itemId: 'IronOre', quantity: 12, quality: 0 },
    timeoutMs: 15000,
    retryRead: false,
  });
  mock.request.mockRejectedValueOnce(new Error('Timeout after applying'));
  expect(await deliveryGateway.grant('42', reward)).toBe('uncertain');
  expect(mock.request).toHaveBeenCalledTimes(2);
  mock.request.mockResolvedValueOnce({ task: { status: 'queued' } });
  expect(await deliveryGateway.grant('42', reward)).toBe('uncertain');
  mock.enabled = false;
  expect(await deliveryGateway.grant('42', reward)).toBe('uncertain');
  expect(mock.request).toHaveBeenCalledTimes(3);
});
