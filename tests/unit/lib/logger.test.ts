import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  describeError,
  fitConsoleLine,
  formatConsoleEntry,
  scopeLabel,
  wrapMessage,
  shouldUseColor,
} from '../../../src/lib/logger';

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ LOG_LEVEL: 'INFO', NODE_ENV: 'production' }) }));

beforeEach(() => {
  // Wide enough that these tests read whole lines; fitting to the terminal has its own test.
  vi.stubEnv('COLUMNS', '1000');
});

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
    vi.stubEnv('LOG_COLOR', 'always');
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

  it('shares the bot console style: colour policy, one-line errors and terminal fitting', () => {
    expect(shouldUseColor({ P_SERVER_UUID: 'uuid' }, false)).toBe(true);
    expect(shouldUseColor({}, false)).toBe(false);
    expect(shouldUseColor({ LOG_COLOR: 'never', P_SERVER_UUID: 'uuid' }, true)).toBe(false);
    expect(shouldUseColor({ LOG_COLOR: 'always', NO_COLOR: '1' }, false)).toBe(true);
    expect(shouldUseColor({ NO_COLOR: '1' }, true)).toBe(false);
    const operational = Object.assign(new Error('Console unavailable'), { name: 'DuneConsoleApiError', code: 503 });
    expect(describeError(operational)).toBe('DuneConsoleApiError: Console unavailable (code 503)');
    expect(describeError(new Error('secret internals'))).toBe('Error: Internal error');
    expect(fitConsoleLine('\u001b[32mabcdefghij\u001b[0m', 6)).toBe('\u001b[32mabcd\u001b[0m…');
    vi.stubEnv('NO_COLOR', '1');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-27T17:00:00Z'));
      // The bot's test suite checks this exact line too, so both consoles stay the same.
      expect(formatConsoleEntry('SUGGESTIONS', 'WARN', 'Autopilot paused', { resetIn: 60, repo: 'o/r' })).toBe(
        '2026-11-27 12:00:00  ▲ WARN  SUGGESTIONS  │ Autopilot paused · reset in = 60  ·  repo = o/r',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps long scopes inside the scope column and wraps long messages under their own scope', () => {
    vi.stubEnv('NO_COLOR', '1');
    expect(scopeLabel('SEASON CLAIMS')).toBe('CLAIMS');
    expect(scopeLabel('A VERY LONG UNKNOWN SCOPE')).toHaveLength(12);
    const at = new Date('2026-11-27T17:00:00Z');
    expect(formatConsoleEntry('SHARD MANAGER', 'INFO', 'Discord shard 0 is ready.', undefined, at)).toBe(
      '2026-11-27 12:00:00  ● INFO  SHARDS       │ Discord shard 0 is ready.',
    );
    const metrics =
      'ready=yes | ping=45ms | loop p99=23ms max=307ms | heap=35MB rss=184MB | db=up (interactive 0/1 busy, 0 waiting; background 0/1 busy, 0 waiting) | archive buffer=0 | cached messages=46 | 429s=0';
    const lines = formatConsoleEntry('METRICS', 'INFO', metrics, undefined, at, 120).split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThan(120);
    expect(lines[1]).toMatch(/^ {42}│ \S/);
    expect(
      lines
        .map((line) => line.slice(44))
        .join(' | ')
        .replace(/ \| /g, '|'),
    ).toBe(metrics.replace(/ \| /g, '|'));
    expect(wrapMessage('short', 75)).toEqual(['short']);
    expect(wrapMessage('x'.repeat(1000), 75).at(-1)).toMatch(/…$/);
  });
});
