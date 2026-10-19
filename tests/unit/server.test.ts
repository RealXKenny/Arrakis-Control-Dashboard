import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceReadiness, readinessUrl, resolveServerOptions } from '../../src/config/server-launcher.mjs';

describe('server launcher', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('uses the custom timestamped STARTUP logger for the single ready line', async () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => {});
    await announceReadiness('http://127.0.0.1:4000/favicon.ico', new AbortController().signal, {
      probe: async () => true,
    });
    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0][0].replace(/\u001B\[[0-9;]*m/g, '')).toMatch(
      /\[.*\] ● \[INFO\] \[STARTUP\] Ready in — Arrakis Control Dashboard is listening \(HTTP check passed\)\./,
    );
  });
  it('checks the actual forwarded port and maps wildcard binds to loopback', () => {
    expect(readinessUrl(['--hostname', '0.0.0.0', '--port=4000'])).toBe('http://127.0.0.1:4000/favicon.ico');
    expect(readinessUrl(['-H::', '-p4001'])).toBe('http://[::1]:4001/favicon.ico');
  });
  it('announces verified readiness once even after the retry window', async () => {
    vi.useFakeTimers();
    const write = vi.fn(),
      probe = vi.fn().mockResolvedValue(true);
    const task = announceReadiness('http://127.0.0.1:4000/favicon.ico', new AbortController().signal, { probe, write });
    await vi.advanceTimersByTimeAsync(21000);
    await task;
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenLastCalledWith('Ready in — Arrakis Control Dashboard is listening (HTTP check passed).');
    await vi.advanceTimersByTimeAsync(60000);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('never announces an unavailable HTTP server and stops retrying after a minute', async () => {
    vi.useFakeTimers();
    const write = vi.fn(),
      probe = vi.fn().mockRejectedValue(new Error('Connection refused'));
    const task = announceReadiness('http://127.0.0.1:4000/favicon.ico', new AbortController().signal, { probe, write });
    await vi.advanceTimersByTimeAsync(61000);
    await task;
    expect(write).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledTimes(60);
  });
  it('cancels readiness announcements immediately on shutdown', async () => {
    vi.useFakeTimers();
    const controller = new AbortController(),
      write = vi.fn(),
      probe = vi.fn().mockResolvedValue(true);
    const task = announceReadiness('http://127.0.0.1:4000/favicon.ico', controller.signal, { probe, write });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await task;
    await vi.advanceTimersByTimeAsync(30000);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('does not announce a successful in-flight check after shutdown begins', async () => {
    const controller = new AbortController(),
      write = vi.fn();
    let complete!: (ready: boolean) => void;
    const probe = () =>
      new Promise<boolean>((resolve) => {
        complete = resolve;
      });
    const task = announceReadiness('http://127.0.0.1:4000/favicon.ico', controller.signal, { probe, write });
    controller.abort();
    complete(true);
    await task;
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
