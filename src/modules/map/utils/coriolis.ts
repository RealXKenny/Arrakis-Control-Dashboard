export function normalizeCoriolisCycleAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function formatCoriolisCountdown(value: string | null, now: number) {
  if (!value) return 'Not reported';
  const remaining = Date.parse(value) - now;
  if (!Number.isFinite(remaining)) return 'Not reported';
  if (remaining <= 0) return 'Cycle updating…';

  const seconds = Math.ceil(remaining / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const finalSeconds = seconds % 60;
  const clock = [hours, minutes, finalSeconds].map((part) => String(part).padStart(2, '0')).join(':');
  return `${days}d ${clock}`;
}
