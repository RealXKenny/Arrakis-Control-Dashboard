import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { getStateStore } from '../../../infrastructure/storage';
import { AppError } from '../../../lib/errors';
import { withTimeout } from '../../../lib/timeout';
import type { ImportRecord } from '../types';
function client() {
  const store = getStateStore();
  if (!store) throw new AppError('Import tracking is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return store;
}
export async function reserveImport(owner: string, record: ImportRecord) {
  const result = await withTimeout(
    client().reserveImport(
      owner,
      new Date().toISOString().slice(0, 10),
      record.id,
      record,
      getServerEnv().BASE_IMPORT_DAILY_LIMIT,
    ),
    12000,
  );
  if (result === 'LIMIT')
    throw new AppError(
      `Daily limit reached: ${getServerEnv().BASE_IMPORT_DAILY_LIMIT} import attempts per UTC day.`,
      429,
      'DAILY_LIMIT',
      true,
    );
  return result === 'NEW' ? null : (result as ImportRecord);
}
export async function finishImport(owner: string, record: ImportRecord) {
  await withTimeout(client().finishImport(owner, record.at.slice(0, 10), record.id, record), 12000);
}
