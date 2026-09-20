import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, getSafeError } from '../../src/lib/errors';
import { createLogger, logger, logRequestAccess } from '../../src/lib/logger';
import { checkRateLimit } from '../../src/lib/rate-limit';
import { deleteSession, getSession, saveSession } from '../../src/lib/session-store';
import { getRequestCookie } from '../../src/infrastructure/cookies';

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

  it('ignores malformed and oversized cookie values', () => {
    expect(
      getRequestCookie({ headers: { cookie: 'dashboard_session=%E0%A4%A' } }, 'dashboard_session'),
    ).toBeUndefined();
    expect(
      getRequestCookie({ headers: { cookie: `dashboard_session=${'x'.repeat(5000)}` } }, 'dashboard_session'),
    ).toBeUndefined();
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

  it('writes debug details to the console only when enabled', () => {
    const output = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    createLogger('DUNE API', 'DEBUG').debug('Provider request completed', { status: 200 });
    const [message] = output.mock.calls[0];
    const plainMessage = message.replace(/\u001B\[[0-9;]*m/g, '');
    expect(plainMessage).toContain('◆ [DEBUG] [DUNE API] Provider request completed');
    expect(plainMessage).toContain('· {"status":200}');
  });

  it('clears ANSI and Pterodactyl terminals before printing the startup banner', () => {
    const clear = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    createLogger('DASHBOARD', 'INFO').header('ARRAKIS CONTROL', 'Dune: Awakening Dashboard');

    expect(clear).toHaveBeenCalledWith('\u001B[2J\u001B[3J\u001B[H');
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(output.mock.invocationCallOrder[0]);
    expect(output.mock.calls.map(([message]) => message).join('\n')).toContain('ARRAKIS CONTROL');
  });

  it('compacts successful request logs and summarizes repeated polling', () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const request = {
      method: 'GET',
      route: `/api/test-${Date.now()}`,
      status: 200,
      durationMs: 41,
    };

    logRequestAccess(request, 1_000);
    logRequestAccess(request, 2_000);
    logRequestAccess(request, 302_000);

    expect(output).toHaveBeenCalledTimes(2);
    const first = output.mock.calls[0][0].replace(/\u001B\[[0-9;]*m/g, '');
    const second = output.mock.calls[1][0].replace(/\u001B\[[0-9;]*m/g, '');
    expect(first).toContain(`[HTTP] GET ${request.route} → 200 (41ms)`);
    expect(first).not.toContain('requestId');
    expect(second).toContain('1 repeat suppressed');
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
