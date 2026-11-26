import { z } from 'zod';

const input = z.object({
  ok: z.literal(true),
  enabled: z.boolean(),
  intervalHours: z.string().max(3),
  lastRunAt: z.string().max(80),
  lastResult: z.enum(['', 'success', 'skipped', 'failed', 'running']),
  nextRun: z.string().max(80),
});
const absoluteTime = (value: string): string | null => {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

export function projectBackupStatus(value: unknown) {
  const result = z.object({ status: input }).safeParse(value);
  if (!result.success) return null;
  const data = result.data.status;
  const hours = Number(data.intervalHours);
  return {
    enabled: data.enabled,
    intervalHours: Number.isInteger(hours) && hours >= 1 && hours <= 168 ? hours : null,
    lastRunAt: absoluteTime(data.lastRunAt),
    lastResult: data.lastResult || null,
    nextRun: absoluteTime(data.nextRun),
  };
}
