import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../src/lib/logger';

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ LOG_LEVEL: 'INFO', NODE_ENV: 'production' }) }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('console presentation', () => {
  it('uses a fixed-width 24-hour timestamp and keeps short details on one line', () => {
    vi.stubEnv('NO_COLOR', '1');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-09T01:22:28Z'));
      const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      createLogger('STARTUP').info('Starting dashboard', { version: '2.0.0', environment: 'production' });
      const line = String(output.mock.calls[0][0]);
      expect(line).toMatch(/^2026-11-08 20:22:28  ● INFO/);
      expect(line).toContain('· version = 2.0.0');
      expect(line).not.toContain('\n');
    } finally {
      vi.useRealTimers();
    }
  });
  it('formats metadata as readable rows while retaining zero and false', () => {
    vi.stubEnv('NO_COLOR', '1');
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    createLogger('CHAT BRIDGE').info('Chat Bridge metrics', {
      received: 0,
      pendingPublishes: 2,
      blocked: false,
      nested: { count: 3 },
    });
    const line = String(output.mock.calls[0][0]);
    expect(line).toContain('INFO  CHAT BRIDGE  │ Chat Bridge metrics');
    expect(line).toContain('received = 0');
    expect(line).toContain('pending publishes = 2');
    expect(line).toContain('blocked = false');
    expect(line).toContain('nested / count = 3');
    expect(line).not.toMatch(/[{}\u001b]/);
  });

  it('redacts nested secrets, survives cycles and neutralizes terminal injection', () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cycle: Record<string, unknown> = { token: 'private-token', nested: { password: 'private-password' } };
    cycle.self = cycle;
    createLogger('REDIS').warn('Unavailable\nFORGED\u001b[2J', cycle);
    const line = String(output.mock.calls[0][0]);
    expect(line).toContain('[REDACTED]');
    expect(line).toContain('[Circular]');
    expect(line).not.toMatch(/private-token|private-password|\nFORGED|\u001b\[2J/);
  });

  it('retains severity filtering and stderr routing', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = createLogger('STARTUP', 'WARN');
    log.info('Hidden');
    log.error('Failed', new Error('sensitive internals'));
    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0][0])).not.toContain('sensitive internals');
  });

  it('bounds large payloads and uses distinct service colors', () => {
    vi.stubEnv('NO_COLOR', undefined);
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    createLogger('REDIS').info('Connected', { nodes: 6 });
    createLogger('CHAT BRIDGE').info(
      'Metrics',
      Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`field${i}`, 'x'.repeat(1000)])),
    );
    expect(String(output.mock.calls[0][0])).toContain('\u001b[95mREDIS');
    expect(String(output.mock.calls[1][0])).toContain('\u001b[96mCHAT BRIDGE');
    expect(String(output.mock.calls[1][0]).length).toBeLessThan(24_000);
  });
});
