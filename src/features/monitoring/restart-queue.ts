import { z } from 'zod';

// The Console returns internal requester information as well; only this bounded projection is public to members.
const entry = z.object({
  id: z.string().min(1).max(100),
  status: z.enum(['counting', 'restarting']),
  target: z.enum(['battlegroup', 'map', 'service']),
  mapLabel: z.string().trim().min(1).max(100),
  restartAt: z.number().int().min(0).max(8_640_000_000_000_000),
});
const queue = z.object({ state: z.object({ entries: z.array(entry).max(20) }) });

export type RestartEntry = z.infer<typeof entry>;

/** Fail closed on unrecognised response shapes rather than inventing a schedule. */
export function projectRestartQueue(value: unknown): RestartEntry[] | null {
  const result = queue.safeParse(value);
  if (!result.success) return null;
  const entries = result.data.state.entries;
  if (new Set(entries.map((item) => item.id)).size !== entries.length) return null;
  return entries.sort((a, b) => a.restartAt - b.restartAt);
}
