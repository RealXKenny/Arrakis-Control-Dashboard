import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, getSafeError } from '../../src/lib/errors';
import { logger } from '../../src/lib/logger';
import { checkRateLimit } from '../../src/lib/rate-limit';
import { deleteSession, getSession, saveSession } from '../../src/lib/session-store';

describe('shared production hardening', () => {
  afterEach(() => vi.restoreAllMocks());

  it('applies rate limits and reports remaining capacity', async () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect((await checkRateLimit(key, { limit: 2, windowMs: 60_000 })).allowed).toBe(true);
    expect((await checkRateLimit(key, { limit: 2, windowMs: 60_000 })).remaining).toBe(0);
    expect((await checkRateLimit(key, { limit: 2, windowMs: 60_000 })).allowed).toBe(false);
  });

  it('persists and invalidates sessions through the storage interface', async () => {
    const sessionId = `session-${Date.now()}`;
    const session = {
      user: { id: '42', username: 'tester' },
      guildId: 'guild',
      roleIds: ['member'],
      expiresAt: Date.now() + 60_000,
    };
    await saveSession(sessionId, session);
    await expect(getSession(sessionId)).resolves.toEqual(session);
    await deleteSession(sessionId);
    await expect(getSession(sessionId)).resolves.toBeNull();
  });

  it('redacts secrets from development logs', () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    logger.info('test', { token: 'secret-value', route: '/api/test' });
    const [message] = output.mock.calls[0];
    const plainMessage = message.replace(/\u001B\[[0-9;]*m/g, '');
    expect(plainMessage).toContain('[INFO]');
    expect(plainMessage).toContain('[DASHBOARD] test');
    expect(plainMessage).toContain('"token":"[REDACTED]"');
    expect(plainMessage).toContain('"route":"/api/test"');
  });

  it('does not expose unexpected server errors', () => {
    expect(getSafeError(new Error('database password is wrong'))).toEqual({
      message: 'Internal server error',
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    });
    expect(getSafeError(new AppError('Invalid input', 400, 'INVALID_INPUT', true))).toEqual({
      message: 'Invalid input',
      statusCode: 400,
      code: 'INVALID_INPUT',
    });
  });
});
