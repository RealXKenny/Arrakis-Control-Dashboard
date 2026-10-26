import { describe, expect, it } from 'vitest';
import { resolveServerOptions } from '../../src/config/server-launcher.mjs';

describe('server launcher', () => {
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
