import { expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { captureApiSnapshot, redactApiSnapshot } from '../../src/lib/api-debug';
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/config/env', () => ({ getServerEnv: () => ({ API_DEBUG_ENABLED: 'true' }) }));

it('redacts credentials and identity recursively and preserves complete arrays', () => {
  expect(
    redactApiSnapshot({ rows: [{ owner_id: 'private', token: 'secret', price: '42' }], cookie: 'session' }),
  ).toEqual({ rows: [{ owner_id: '[REDACTED]', token: '[REDACTED]', price: '42' }], cookie: '[REDACTED]' });
  expect(redactApiSnapshot(Array(201).fill(1))).toHaveLength(201);
});

it('omits authentication payloads, omits query strings and tolerates filesystem failures', async () => {
  await captureApiSnapshot('/api/auth/login', 200, { token: 'secret' });
  expect(String(vi.mocked(writeFile).mock.calls[0][1])).not.toContain('secret');
  await captureApiSnapshot('/api/exchange/items?q=private', 200, { rows: [], totalCount: 0 });
  const saved = String(vi.mocked(writeFile).mock.calls[1][1]);
  expect(saved).not.toContain('private');
  expect(JSON.parse(saved).response).toEqual({ rows: [], totalCount: 0 });
  vi.mocked(mkdir).mockRejectedValueOnce(new Error('Read-only filesystem'));
  await expect(captureApiSnapshot('/api/exchange/items', 200, {})).resolves.toBeUndefined();
});

it('replaces one stable filename and keeps long data for all endpoints', async () => {
  const data = { text: 'x'.repeat(2000), rows: Array(500).fill({ value: 1 }) };
  await captureApiSnapshot('/api/player?q=ignored', 200, data, 'portal', 'GET');
  await captureApiSnapshot('/api/player?q=other', 503, { error: 'Unavailable' }, 'portal', 'GET');
  const calls = vi.mocked(writeFile).mock.calls.slice(-2);
  expect(String(calls[0][0]).replace(/\.[a-f0-9-]{36}\.tmp$/, '')).toBe(
    String(calls[1][0]).replace(/\.[a-f0-9-]{36}\.tmp$/, ''),
  );
  expect(JSON.parse(String(calls[0][1])).response).toEqual(data);
  expect(JSON.parse(String(calls[1][1])).status).toBe(503);
});

it('safely serializes cyclic objects, big integers, errors and repeated references', () => {
  const child = { count: 2 };
  const data: Record<string, unknown> = { child, repeated: child, large: 10n, error: new Error('private') };
  data.self = data;
  expect(redactApiSnapshot(data)).toEqual({
    child: { count: 2 },
    repeated: { count: 2 },
    large: '10',
    error: '[REDACTED]',
    self: '[CIRCULAR]',
  });
});
