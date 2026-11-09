import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));
const { FakeConsoleError } = vi.hoisted(() => {
  class FakeConsoleError extends Error {
    constructor(
      message: string,
      readonly status = 0,
    ) {
      super(message);
    }
  }
  return { FakeConsoleError };
});
const request = vi.hoisted(() => vi.fn());
vi.mock('../../../src/server/integrations/dune', () => ({
  DuneConsoleApiError: FakeConsoleError,
  getDuneClient: () => ({ request }),
}));

import {
  classifyAdjustmentError,
  consoleGateway,
  isOffline,
  judgeAdjustment,
  parseSolarisBalance,
} from '../../../src/features/casino/server/console-gateway';

/** Replies as the real Console sent them (supplied by the operator). */
const CURRENCY_REPLY = {
  capabilities: { currency: true },
  rows: [
    { currency_id: 0, balance: '12533085', label: 'Solari Credit' },
    { currency_id: 1, balance: '10000', label: 'House Credit' },
  ],
};
const adjustReply = (patch: Record<string, unknown> = {}, resultPatch: Record<string, unknown> = {}) => ({
  supported: true,
  backupCreated: false,
  result: {
    ok: true,
    player: { actorId: 6, accountId: 1, controllerId: 4, playerStateId: 2, onlineStatus: 'Offline' },
    currencyId: 0,
    amount: -25,
    balance: { currency_id: 'Solaris', balance: '12533060' },
    message: 'Solari Credit was updated in the database and will be loaded when the player next joins.',
    ...resultPatch,
  },
  ...patch,
});

beforeEach(() => {
  request.mockReset();
});

describe('reading the Solaris balance', () => {
  it('takes currency 0 from the real /currency reply, never House Credit', () => {
    expect(parseSolarisBalance(CURRENCY_REPLY)).toBe(12_533_085n);
    expect(parseSolarisBalance({ rows: [{ currency_id: 0, balance: 7 }] })).toBe(7n);
    expect(parseSolarisBalance({ rows: [{ currency_id: '0', balance: '0' }] })).toBe(0n);
  });

  it.each([
    [null],
    [{}],
    [{ rows: [] }],
    [{ rows: [{ currency_id: 1, balance: '10000' }] }], // House Credit only
    [
      {
        rows: [
          { currency_id: 0, balance: '1' },
          { currency_id: 0, balance: '2' },
        ],
      },
    ], // ambiguous
    [{ rows: [{ currency_id: 0, balance: '-5' }] }],
    [{ rows: [{ currency_id: 0, balance: '1.5' }] }],
    [{ rows: [{ currency_id: 0, balance: 'abc' }] }],
    [{ rows: [{ currency_id: 0 }] }],
    [{ rows: [{ currency_id: null, balance: '5' }] }],
    [{ total: 5 }], // the old guess at the shape is not accepted
  ])('refuses %j rather than guessing a balance', (payload) => {
    expect(() => parseSolarisBalance(payload)).toThrow();
  });

  it('reads the balance through the currency endpoint, for a validated player id only', async () => {
    request.mockResolvedValue(CURRENCY_REPLY);
    expect(await consoleGateway.getBalance('4242')).toBe(12_533_085n);
    expect(request).toHaveBeenCalledWith('GET', '/api/players/4242/currency', expect.anything());
    await expect(consoleGateway.getBalance('a/b')).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('only a clearly offline player counts as offline', () => {
  it.each(['Offline', 'offline', ' OFFLINE '])('accepts %j', (status) => expect(isOffline(status)).toBe(true));
  it.each(['Online', 'online', '', 'Unknown', 'In menu', null, undefined, 0, {}])('treats %j as online', (status) =>
    expect(isOffline(status)).toBe(false),
  );
});

describe('judging the Console reply to an adjustment', () => {
  it('accepts exactly the real reply: Solaris, the right amount, offline, and the expected new balance', () => {
    expect(judgeAdjustment(adjustReply(), -25n, 12_533_060n)).toBe('applied');
  });

  it('is uncertain when the player was online when it was written, because the change could be overwritten', () => {
    const online = adjustReply({}, { player: { onlineStatus: 'Online' } });
    expect(judgeAdjustment(online, -25n, 12_533_060n)).toBe('uncertain');
    expect(judgeAdjustment(adjustReply({}, { player: {} }), -25n, 12_533_060n)).toBe('uncertain');
  });

  it('is uncertain when the new balance is not the one expected, or the amount or currency differs', () => {
    expect(judgeAdjustment(adjustReply(), -25n, 12_533_061n)).toBe('uncertain');
    expect(judgeAdjustment(adjustReply({}, { balance: { balance: '12533059' } }), -25n, 12_533_060n)).toBe('uncertain');
    expect(judgeAdjustment(adjustReply({}, { amount: -24 }), -25n, 12_533_060n)).toBe('uncertain');
    expect(judgeAdjustment(adjustReply({}, { currencyId: 1 }), -25n, 12_533_060n)).toBe('uncertain');
    expect(judgeAdjustment(adjustReply(), 25n, 12_533_060n)).toBe('uncertain');
  });

  it('is uncertain when the Console says it did not succeed or does not support the call', () => {
    expect(judgeAdjustment(adjustReply({}, { ok: false }), -25n, 12_533_060n)).toBe('uncertain');
    expect(judgeAdjustment(adjustReply({ supported: false }), -25n, 12_533_060n)).toBe('uncertain');
    expect(judgeAdjustment(adjustReply({}, { ok: 'true' }), -25n, 12_533_060n)).toBe('uncertain');
  });

  it.each([[null], [{}], [{ result: {} }], ['ok'], [[]]])('is uncertain for an unrecognisable reply %j', (payload) => {
    expect(judgeAdjustment(payload, -25n, 12_533_060n)).toBe('uncertain');
  });
});

describe('sending an adjustment', () => {
  it('sends only Solaris (currencyId 0) with the documented confirmation, once, and applies only on a verified reply', async () => {
    request.mockResolvedValue(adjustReply());
    expect(await consoleGateway.adjust('4242', -25n, 12_533_060n)).toBe('applied');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      'POST',
      '/api/players/4242/add-currency',
      expect.objectContaining({
        body: { currencyId: 0, amount: -25, confirmation: 'ADD CURRENCY' },
        retryRead: false,
      }),
    );
  });

  it('does not call a 200 an application when the reply fails verification', async () => {
    request.mockResolvedValue(adjustReply({}, { player: { onlineStatus: 'Online' } }));
    expect(await consoleGateway.adjust('4242', -25n, 12_533_060n)).toBe('uncertain');
    request.mockResolvedValue({ ok: true });
    expect(await consoleGateway.adjust('4242', -25n, 12_533_060n)).toBe('uncertain');
  });

  it('refuses zero, oversized and malformed requests without calling the Console', async () => {
    expect(await consoleGateway.adjust('4242', 0n, 0n)).toBe('rejected');
    expect(await consoleGateway.adjust('4242', 1_000_000_000_001n, 0n)).toBe('rejected');
    expect(await consoleGateway.adjust('../etc', 5n, 5n)).toBe('rejected');
    expect(await consoleGateway.adjust('4242', 5n, -1n)).toBe('rejected');
    expect(request).not.toHaveBeenCalled();
  });

  it('classifies explicit refusals as rejected and everything ambiguous as uncertain', () => {
    for (const status of [400, 401, 403, 404, 409, 422])
      expect(classifyAdjustmentError(new FakeConsoleError('x', status))).toBe('rejected');
    for (const status of [0, 200, 500, 502, 503, 504, 429])
      expect(classifyAdjustmentError(new FakeConsoleError('x', status))).toBe('uncertain');
    expect(classifyAdjustmentError(new Error('boom'))).toBe('uncertain');
  });

  it('reports a timed-out adjustment as uncertain, after exactly one attempt', async () => {
    request.mockImplementation(async () => {
      throw new FakeConsoleError('timeout', 0);
    });
    expect(await consoleGateway.adjust('4242', 5n, 5n)).toBe('uncertain');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
