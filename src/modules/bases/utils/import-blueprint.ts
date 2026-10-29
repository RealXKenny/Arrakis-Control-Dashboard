import { clearClientReadCache } from '../../../lib/client-cache';
import type { Blueprint } from '../schema';

export const IMPORT_UNCONFIRMED = 'Import could not be confirmed. Check your backpack before retrying.';

/** Shared delivery path for uploaded and marketplace blueprints; never automatically retry a mutation. */
export async function importBlueprint(blueprint: Blueprint, title: string, requestId: string, signal: AbortSignal) {
  const response = await fetch('/api/bases/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ requestId, title: title.slice(0, 80) || 'Blueprint', blueprint }),
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(IMPORT_UNCONFIRMED);
  clearClientReadCache(true);
  return typeof body.record?.message === 'string' ? body.record.message : 'Check your backpack for delivery.';
}
