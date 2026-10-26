import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceReadiness, resolveReadinessUrl, resolveServerOptions } from '../../src/config/server-launcher.mjs';

describe('server launcher', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    [['--hostname', '0.0.0.0', '--port', '3010'], 'http://127.0.0.1:3010/portal'],
    [['--hostname=::', '--port=4000'], 'http://[::1]:4000/portal'],
    [['-H127.0.0.1', '-p4001'], 'http://127.0.0.1:4001/portal'],
    [['-H', '::1', '-p', '4002'], 'http://[::1]:4002/portal'],
  ])('probes the effective CLI binding %j', (args, expected) => {
    expect(resolveReadinessUrl(args)).toBe(expected);
  });

  it('retries failures and announces readiness exactly once', async () => {
    vi.useFakeTimers();
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error('Starting'))
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const write = vi.fn();
    const pending = announceReadiness('http://127.0.0.1:2008/portal', new AbortController().signal, { probe, write });
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(probe).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenCalledExactlyOnceWith(
      'Ready in — Arrakis Control Dashboard is listening (HTTP check passed).',
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops quietly after a minute without a ready listener', async () => {
    vi.useFakeTimers();
    const probe = vi.fn().mockResolvedValue(false);
    const write = vi.fn();
    const pending = announceReadiness('http://127.0.0.1:2008/portal', new AbortController().signal, { probe, write });
    await vi.advanceTimersByTimeAsync(60000);
    await pending;
    expect(probe).toHaveBeenCalledTimes(60);
    expect(write).not.toHaveBeenCalled();
  });

  it('cancels a pending retry promptly on shutdown', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const write = vi.fn();
    const probe = vi.fn().mockResolvedValue(false);
    const pending = announceReadiness('http://127.0.0.1:2008/portal', controller.signal, { probe, write });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await pending;
    expect(probe).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not announce if shutdown happens during a successful probe', async () => {
    const controller = new AbortController();
    const write = vi.fn();
    await announceReadiness('http://127.0.0.1:2008/portal', controller.signal, {
      probe: async () => {
        controller.abort();
        return true;
      },
      write,
    });
    expect(write).not.toHaveBeenCalled();
  });
  it('uses the existing local defaults', () => {
    expect(resolveServerOptions({})).toEqual(['--hostname', '127.0.0.1', '--port', '2008']);
  });

  it('uses server binding values loaded from the environment', () => {
    expect(resolveServerOptions({ SERVER_HOSTNAME: '0.0.0.0', SERVER_PORT: '3010' })).toEqual([
      '--hostname',
      '0.0.0.0',
      '--port',
      '3010',
    ]);
  });

  it('lets explicit Next.js options override the environment', () => {
    expect(
      resolveServerOptions({ SERVER_HOSTNAME: '127.0.0.1', SERVER_PORT: '2008' }, [
        '--hostname',
        '0.0.0.0',
        '--port=4000',
      ]),
    ).toEqual([]);
  });

  it.each([
    [{ SERVER_HOSTNAME: 'invalid hostname' }, 'Invalid SERVER_HOSTNAME'],
    [{ SERVER_PORT: '0' }, 'Invalid SERVER_PORT'],
    [{ SERVER_PORT: '65536' }, 'Invalid SERVER_PORT'],
    [{ SERVER_PORT: 'not-a-port' }, 'Invalid SERVER_PORT'],
  ])('rejects an invalid server binding', (env, message) => {
    expect(() => resolveServerOptions(env)).toThrow(message);
  });
});
