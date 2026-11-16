import { expect, it } from 'vitest';
import {
  beginCheck,
  emptyHealth,
  failedRead,
  freshnessLabel,
  sourceHealth,
  sourceReadTime,
  successfulRead,
} from '../../../src/features/monitoring/freshness';
const now = Date.parse('2026-11-15T20:00:00Z');
const stamp = new Date(now).toISOString();
it('starts unknown, labels exact stale boundaries and never treats missing or future timestamps as fresh', () => {
  expect(freshnessLabel(emptyHealth(), now)).toBe('Freshness unknown');
  const health = successfulRead(beginCheck(emptyHealth(), now), stamp, false);
  expect(freshnessLabel(health, now + 59999)).toBe('Fresh');
  expect(freshnessLabel(health, now + 60000)).toBe('Stale');
  expect(freshnessLabel(health, now - 6000)).toContain('Clock difference');
  expect(freshnessLabel(successfulRead(health, null, false), now)).toBe('Freshness unknown');
  expect(freshnessLabel(successfulRead(health, 'invalid', false), now)).toBe('Freshness unknown');
  expect(successfulRead(health, '2026', false).lastSuccessAt).toBeNull();
});
it('failed attempts and pauses preserve only the original success time, never inventing another read', () => {
  const success = successfulRead(beginCheck(emptyHealth(), now), stamp, true);
  const failure = failedRead(beginCheck(success, now + 10000));
  expect(failure.lastSuccessAt).toBe(stamp);
  expect(failure.lastAttemptAt).toBe(new Date(now + 10000).toISOString());
  expect(freshnessLabel(failure, now + 20000)).toContain('Outage');
  expect(freshnessLabel({ ...failure, phase: 'paused' }, now)).toContain('Paused');
  expect(failedRead(failure, true).lastSuccessAt).toBeNull();
  expect(freshnessLabel(success, now)).toContain('partial coverage');
});
it('cached timestamps do not advance when a check happens again', () => {
  const old = successfulRead(emptyHealth(), stamp, false);
  const cached = successfulRead(beginCheck(old, now + 120000), stamp, false);
  expect(cached.lastSuccessAt).toBe(stamp);
  expect(freshnessLabel(cached, now + 120000)).toBe('Stale');
});
it('keeps historical source metadata only for the same verified scope and clears unsupported/unlinked contexts', () => {
  const context = 'a'.repeat(64);
  const success = sourceHealth(undefined, { context, readAt: stamp, status: 'partial' }, stamp);
  expect(sourceHealth(success, { context, readAt: null, status: 'unavailable' }, stamp).lastSuccessAt).toBe(stamp);
  expect(
    sourceHealth(success, { context: 'b'.repeat(64), readAt: null, status: 'unavailable' }, stamp).lastSuccessAt,
  ).toBeNull();
  for (const status of ['unsupported', 'unlinked', 'not-applicable']) {
    const next = sourceHealth(success, { context: null, readAt: stamp, status }, stamp);
    expect(next.lastSuccessAt).toBeNull();
    expect(next.phase).toBe(status);
  }
});
it('uses the oldest actual successful source read instead of failed sources or scan start time', () => {
  expect(
    sourceReadTime([
      { status: 'unavailable', checkedAt: '2020-01-01T00:00:00Z' },
      { status: 'ok', checkedAt: stamp },
      { status: 'ok', checkedAt: new Date(now - 10000).toISOString() },
    ]),
  ).toBe(new Date(now - 10000).toISOString());
  expect(sourceReadTime([{ status: 'unavailable', checkedAt: stamp }])).toBeNull();
});
