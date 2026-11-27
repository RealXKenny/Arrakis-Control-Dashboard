import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join } from 'node:path';
import {
  announceReadiness,
  relayOutput,
  terminalHints,
  assertProductionBuild,
  prepareImageCache,
  resolveReadinessUrl,
  resolveServerOptions,
} from '../../../scripts/server-launcher.mjs';

const run = promisify(execFile);

describe('server launcher', () => {
  it('can be imported from node -e without an entry script', async () => {
    // The release image check imports the launcher this way, where process.argv[1] is undefined.
    const root = await mkdtemp(join(tmpdir(), 'arrakis-import-'));
    try {
      const launcher = new URL('../../../scripts/server-launcher.mjs', import.meta.url).href;
      await run(process.execPath, [
        '--input-type=module',
        '-e',
        `import { prepareImageCache } from ${JSON.stringify(launcher)}; await prepareImageCache(${JSON.stringify(root)})`,
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  afterEach(() => vi.useRealTimers());

  it.each([false, true])('prepares an image cache with a missing target (linked: %s)', async (linked) => {
    const root = await mkdtemp(join(tmpdir(), 'arrakis-image-cache-'));
    try {
      const app = join(root, 'app');
      const cache = join(app, '.next', 'cache');
      const target = linked ? join(root, 'server-volume', '.cache', 'arrakis-dashboard') : cache;
      if (linked) {
        await mkdir(join(app, '.next'), { recursive: true });
        await symlink(target, cache, process.platform === 'win32' ? 'junction' : 'dir');
      }
      await prepareImageCache(app);
      await writeFile(join(cache, 'images', 'cached-image'), 'image bytes');
      await prepareImageCache(app);
      expect(await readFile(join(target, 'images', 'cached-image'), 'utf8')).toBe('image bytes');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('explains how to fix a missing production build', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arrakis-build-check-'));
    try {
      await expect(assertProductionBuild(root)).rejects.toThrow(/npm run build/u);
      await mkdir(join(root, '.next'));
      await expect(assertProductionBuild(root)).rejects.toThrow(/BUILD_ID is missing/u);
      await writeFile(join(root, '.next', 'BUILD_ID'), 'build-1');
      await expect(assertProductionBuild(root)).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails before startup when the cache path cannot be a directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arrakis-image-cache-'));
    try {
      await mkdir(join(root, '.next'));
      await writeFile(join(root, '.next', 'cache'), 'not a directory');
      await expect(prepareImageCache(root)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
      'Arrakis Control Dashboard is listening (ready in 2.0s, HTTP check passed).',
    );
    // The update supervisor's health check and the Pterodactyl egg both wait for this phrase.
    const release = JSON.parse(
      await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
    ).arrakisRelease;
    expect(String(write.mock.calls[0]?.[0])).toMatch(new RegExp(release.readyPattern));
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

  it('restyles Next.js output and passes the dashboard logger lines through unchanged', async () => {
    vi.stubEnv('NO_COLOR', '1');
    const { PassThrough } = await import('node:stream');
    const stream = new PassThrough();
    const lines: string[] = [];
    relayOutput(stream, (line: string) => lines.push(line));
    const styled = '2026-11-27 12:00:00  ● INFO  DASHBOARD    │ Dashboard services ready';
    stream.write('   \u001b[1m▲ Next.js 16.4.6\u001b[0m\n\n' + styled + '\n - Loc');
    stream.end('al: http://127.0.0.1:2008');
    await new Promise((resolve) => stream.once('end', resolve));
    expect(lines[0]).toMatch(/● INFO {2}NEXT {9}│ ▲ Next\.js 16\.4\.6$/u);
    expect(lines[1]).toBe(styled);
    expect(lines[2]).toMatch(/NEXT {9}│ - Local: http:\/\/127\.0\.0\.1:2008$/u);
    expect(lines).toHaveLength(3);
  });

  it('hands the dashboard the terminal width and colours only in a terminal', () => {
    expect(terminalHints({}, { isTTY: false, columns: 100 })).toEqual({});
    expect(terminalHints({}, { isTTY: true, columns: 100 })).toEqual({ COLUMNS: '100', LOG_COLOR: 'always' });
    expect(terminalHints({ NO_COLOR: '1', COLUMNS: '80' }, { isTTY: true, columns: 100 })).toEqual({});
  });
});
