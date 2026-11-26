import { z } from 'zod';

const inventoryRow = z
  .object({
    created: z.string().trim().min(1).max(80).optional(),
    createdAt: z.string().datetime({ offset: true }).optional(),
    automatic: z.boolean().optional(),
    type: z.string().trim().min(1).max(60).optional(),
    source: z.string().trim().min(1).max(60).optional(),
  })
  .passthrough();
export type BackupInventoryItem = {
  createdAt: string | null;
  reportedCreated: string | null;
  automatic: boolean | null;
  kind: 'database' | 'system';
};

function project(value: unknown, kind: BackupInventoryItem['kind']): BackupInventoryItem[] | null {
  const result = z.object({ rows: z.array(inventoryRow).max(100) }).safeParse(value);
  if (!result.success) return null;
  return result.data.rows.map((row) => ({
    createdAt: row.createdAt ? new Date(Date.parse(row.createdAt)).toISOString() : null,
    reportedCreated: row.created ?? null,
    automatic: row.automatic ?? (row.type ? /automatic/i.test(row.type) : null),
    kind,
  }));
}

export function projectDatabaseBackups(value: unknown) {
  return project(value, 'database');
}
export function projectSystemBackups(value: unknown) {
  return project(value, 'system');
}
