import { describe, expect, it } from 'vitest';
import operations from '../../../src/features/admin/catalog.json' with { type: 'json' };
import { isHighRiskOperation, LOW_RISK_MUTATING_OPERATIONS } from '../../../src/features/admin/server/risk';

const find = (method: string, route: string) => {
  const operation = operations.find((entry) => entry.method === method && entry.route === route);
  if (!operation) throw new Error(`catalog is missing ${method} ${route}`);
  return operation;
};

/** The 37 destructive-looking operations that previously received only the general 12-hour window. */
const PREVIOUSLY_UNDER_PROTECTED = [
  '/api/setup/write-config',
  '/api/server/stop',
  '/api/server/restart',
  '/api/server/restart-service',
  '/api/server/funcom-token',
  '/api/server/restart-schedule',
  '/api/server/ip-change-restart',
  '/api/server/ip-change-restart/check',
  '/api/server/restart-queue',
  '/api/server/restart-queue/cancel',
  '/api/server/restart-queue/restart-now',
  '/api/server/shutdown-protection',
  '/api/server/shutdown-protection/remove',
  '/api/updates/apply-game',
  '/api/updates/apply-stack',
  '/api/updates/repair-runtime',
  '/api/backups/restore',
  '/api/backups/delete-all',
  '/api/backups/import-external',
  '/api/backups/system/import',
  '/api/backups/system/delete-selected',
  '/api/backups/system/delete-all',
  '/api/backups/system/{name}/restore',
  '/api/players/{playerId}/kick',
  '/api/players/{playerId}/specializations/reset',
  '/api/players/{playerId}/specializations/keystones/reset-all',
  '/api/players/{playerId}/journey/reset',
  '/api/players/{playerId}/tutorials/reset',
  '/api/players/{playerId}/repair-gear',
  '/api/players/{playerId}/repair-vehicle-decay',
  '/api/players/kick-all-online',
  '/api/base-backups/import',
  '/api/exchange/market/buyback/log/clear',
  '/api/exchange/market/seed/clear',
  '/api/blueprints/import',
  '/api/admin/history/clear',
  '/api/admin/landsraad/milestone-preset',
];

describe('administrator high-risk classification', () => {
  it.each(PREVIOUSLY_UNDER_PROTECTED)('POST %s needs the high-risk sign-in window', (route) => {
    const operation = find('POST', route);
    expect(isHighRiskOperation(operation)).toBe(true);
  });

  it('covers exactly 37 previously under-protected operations', () => {
    expect(PREVIOUSLY_UNDER_PROTECTED).toHaveLength(37);
  });

  it('treats every mutating operation as high risk unless it is explicitly reviewed as low risk', () => {
    for (const operation of operations) {
      if (operation.method === 'GET' && !['download', 'upload', 'multipart'].includes(operation.mode)) continue;
      const expected = !LOW_RISK_MUTATING_OPERATIONS.has(operation.id);
      if (operation.method !== 'GET' && !expected && operation.confirmationPhrases.length === 0)
        expect(isHighRiskOperation(operation), operation.id).toBe(false);
      else expect(isHighRiskOperation(operation), operation.id).toBe(true);
    }
  });

  it('classifies uploads, downloads, deletes and confirmed operations as high risk whatever their method', () => {
    const base = { id: 'x', method: 'POST', mode: 'json', confirmationPhrases: [] as string[] };
    expect(isHighRiskOperation({ ...base, mode: 'upload' })).toBe(true);
    expect(isHighRiskOperation({ ...base, mode: 'multipart' })).toBe(true);
    expect(isHighRiskOperation({ ...base, method: 'GET', mode: 'download' })).toBe(true);
    expect(isHighRiskOperation({ ...base, method: 'DELETE' })).toBe(true);
    expect(isHighRiskOperation({ ...base, confirmationPhrases: ['WIPE'] })).toBe(true);
  });

  it('defaults an unknown mutating operation to strict and leaves plain reads alone', () => {
    const unknown = { id: 'post-new-thing', method: 'POST', mode: 'json', confirmationPhrases: [] as string[] };
    for (const method of ['POST', 'PUT', 'PATCH']) expect(isHighRiskOperation({ ...unknown, method })).toBe(true);
    expect(isHighRiskOperation({ ...unknown, method: 'GET' })).toBe(false);
  });

  it('only whitelists operations that exist in the catalog and none that look destructive', () => {
    const ids = new Set(operations.map((operation) => operation.id));
    for (const id of LOW_RISK_MUTATING_OPERATIONS) {
      expect(ids.has(id), id).toBe(true);
      expect(id).not.toMatch(/delete|restore|import|stop|restart|apply|reset|clear|kick|wipe|remove|install/);
    }
  });
});
