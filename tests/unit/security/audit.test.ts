import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  redis: { eval: vi.fn() } as { eval: ReturnType<typeof vi.fn> } | null,
}));

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => state.env }));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => state.redis }));

beforeEach(() => {
  vi.restoreAllMocks();
  state.env = {
    AUDIT_LOG_STDOUT: true,
    AUDIT_LOG_REDIS: true,
    AUDIT_LOG_RETENTION_DAYS: 30,
    AUDIT_LOG_MAX_ENTRIES: 500,
    LOG_LEVEL: 'FATAL',
  };
  state.redis = { eval: vi.fn().mockResolvedValue(1) };
});

describe('audit data sanitising', () => {
  it('drops credential-like keys, nested data and control characters, and bounds values', async () => {
    const { sanitizeAuditData } = await import('../../../src/lib/security/audit');
    const data = sanitizeAuditData({
      operation: 'post-x\nforged line',
      password: 'hunter2',
      accessToken: 'abc',
      Authorization: 'Bearer abc',
      sessionId: 'sid',
      email: 'a@b.c',
      body: '{"secret":1}',
      nested: { a: 1 },
      list: [1],
      count: 3,
      ok: true,
      long: 'x'.repeat(1000),
      'bad key': 'x',
    });
    expect(Object.keys(data!).sort()).toEqual(['count', 'long', 'ok', 'operation']);
    expect(data!.operation).toBe('post-x forged line');
    expect(String(data!.long)).toHaveLength(200);
  });
});

describe('recordAudit', () => {
  it('writes one JSON line to stdout and a bounded entry to Redis', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { recordAudit } = await import('../../../src/lib/security/audit');
    await recordAudit({
      event: 'admin.operation',
      outcome: 'success',
      actor: '123456789012345678',
      ip: '203.0.113.9',
      data: { operation: 'delete-guilds-guildid', token: 'must-not-appear' },
    });
    const line = String(write.mock.calls.find(([text]) => String(text).startsWith('AUDIT '))?.[0]);
    expect(line).not.toContain('must-not-appear');
    const event = JSON.parse(line.slice('AUDIT '.length));
    expect(event).toMatchObject({ event: 'admin.operation', outcome: 'success', actor: '123456789012345678' });
    expect(event.data).toEqual({ operation: 'delete-guilds-guildid' });

    const [script, keys, args] = state.redis!.eval.mock.calls[0];
    expect(script).toContain('ZREMRANGEBYSCORE');
    expect(script).toContain('ZREMRANGEBYRANK');
    expect(keys).toEqual(['arrakis:{audit}:v1:events']);
    // Retention window (30 days) and entry cap (500) come from configuration.
    expect(args[2]).toBeLessThan(Date.now() - 29 * 86_400_000);
    expect(args.slice(3)).toEqual([500, 30 * 86_400]);
  });

  it('honours the stdout and Redis switches', async () => {
    state.env.AUDIT_LOG_STDOUT = false;
    state.env.AUDIT_LOG_REDIS = false;
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { recordAudit } = await import('../../../src/lib/security/audit');
    await recordAudit({ event: 'x', outcome: 'success' });
    expect(write).not.toHaveBeenCalled();
    expect(state.redis!.eval).not.toHaveBeenCalled();
  });

  it('never throws when Redis fails and still emits the stdout copy', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.redis!.eval.mockRejectedValue(new Error('down'));
    const { recordAudit } = await import('../../../src/lib/security/audit');
    await expect(recordAudit({ event: 'auth.login', outcome: 'success', actor: '1' })).resolves.toBeUndefined();
  });

  it('ignores actors that are not Discord IDs', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { recordAudit } = await import('../../../src/lib/security/audit');
    await recordAudit({ event: 'x', outcome: 'denied', actor: 'forged\nactor' });
    expect(String(write.mock.calls[0][0])).not.toContain('forged');
  });
});

describe('readAudit', () => {
  it('returns parsed newest-first entries, skips malformed ones and caps the limit', async () => {
    state.redis!.eval.mockResolvedValue([JSON.stringify({ event: 'a', outcome: 'success' }), 'not json']);
    const { readAudit } = await import('../../../src/lib/security/audit');
    expect(await readAudit(10_000)).toEqual([{ event: 'a', outcome: 'success' }]);
    expect(state.redis!.eval.mock.calls[0][2]).toEqual([500]);
  });
});
