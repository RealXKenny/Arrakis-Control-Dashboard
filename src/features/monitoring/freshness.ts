import { z } from 'zod';
const readTime = z.iso.datetime();
export type ReadingHealth = {
  phase: 'idle' | 'checking' | 'available' | 'outage' | 'paused' | 'unsupported' | 'unlinked' | 'not-applicable';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  partial: boolean;
};
export const emptyHealth = (): ReadingHealth => ({
  phase: 'idle',
  lastAttemptAt: null,
  lastSuccessAt: null,
  partial: false,
});
export function beginCheck(previous: ReadingHealth, now = Date.now()): ReadingHealth {
  return { ...previous, phase: 'checking', lastAttemptAt: new Date(now).toISOString() };
}
export function successfulRead(previous: ReadingHealth, observedAt: string | null, partial: boolean): ReadingHealth {
  const valid = observedAt !== null && readTime.safeParse(observedAt).success;
  return { ...previous, phase: 'available', partial, lastSuccessAt: valid ? observedAt : null };
}
export function failedRead(previous: ReadingHealth, clearHistory = false): ReadingHealth {
  return { ...(clearHistory ? emptyHealth() : previous), phase: 'outage', lastAttemptAt: previous.lastAttemptAt };
}
export function freshnessLabel(health: ReadingHealth, now: number, staleAfterMs = 60000): string {
  if (health.phase === 'checking') return 'Checking';
  if (health.phase === 'outage') return 'Outage / check failed';
  if (health.phase === 'paused') return 'Paused · refresh required';
  if (health.phase === 'unsupported') return 'Unsupported';
  if (health.phase === 'unlinked') return 'Character link required';
  if (health.phase === 'not-applicable') return 'Not applicable';
  if (!health.lastSuccessAt || health.phase === 'idle') return 'Freshness unknown';
  const age = now - Date.parse(health.lastSuccessAt);
  if (!Number.isFinite(age) || age < -5000) return 'Clock difference · freshness unknown';
  return `${age >= staleAfterMs ? 'Stale' : 'Fresh'}${health.partial ? ' · partial coverage' : ''}`;
}
export type ScopedHealth = ReadingHealth & { context: string | null };
export function sourceHealth(
  previous: ScopedHealth | undefined,
  source: { status: string; context: string | null; readAt: string | null },
  attemptedAt: string,
): ScopedHealth {
  const base =
    previous && source.context && source.context === previous.context
      ? previous
      : { ...emptyHealth(), context: source.context };
  let next: ReadingHealth = { ...base, lastAttemptAt: attemptedAt };
  if (source.status === 'checked' || source.status === 'partial')
    next = successfulRead(next, source.readAt, source.status === 'partial');
  else if (source.status === 'unsupported' || source.status === 'unlinked' || source.status === 'not-applicable')
    next = { ...emptyHealth(), phase: source.status, lastAttemptAt: attemptedAt };
  else next = failedRead(next);
  return { ...next, context: source.context };
}
/** Earliest successful source observation; a scan's start time is not a successful read. */
export function sourceReadTime(sources: { status: string; checkedAt: string }[]): string | null {
  const times = sources
    .filter((s) => s.status === 'ok' && readTime.safeParse(s.checkedAt).success)
    .map((s) => s.checkedAt);
  return times.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}
