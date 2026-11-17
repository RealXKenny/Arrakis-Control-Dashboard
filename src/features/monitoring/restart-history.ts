import { z } from 'zod';

const row = z.object({
  id: z.string().min(1).max(100),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  durationSeconds: z.number().finite().min(0).max(31_536_000),
  scope: z.enum(['battlegroup', 'map', 'service']),
  map: z.string().max(100),
  result: z.enum(['Succeeded', 'Failed']),
});
const history = z.object({ rows: z.array(row).max(100) });
export type RestartHistoryRow = z.infer<typeof row>;

/** Ignore provider reasons and operator details: they are not public incident evidence. */
export function projectRestartHistory(value: unknown): RestartHistoryRow[] | null {
  const result = history.safeParse(value);
  if (!result.success) return null;
  const rows = result.data.rows;
  if (new Set(rows.map((item) => item.id)).size !== rows.length) return null;
  if (rows.some((item) => Date.parse(item.finishedAt) < Date.parse(item.startedAt))) return null;
  return rows.sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt));
}
