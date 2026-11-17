import '../../../lib/assert-server';
import { DuneConsoleApiError, getDuneClient } from '../../../server/integrations/dune';
import type { CapabilityReading, CapabilityState } from '../capabilities';
import { projectRestartQueue } from '../restart-queue';
import { projectRestartHistory } from '../restart-history';
import { projectBackupStatus } from '../backup-status';
import { projectDatabaseBackups, projectSystemBackups } from '../backup-evidence';

const lastSuccess = new Map<CapabilityReading['id'], string>();
let cache: { until: number; value: Promise<CapabilityReading[]> } | undefined;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const command = (operation: string) => (value: unknown) => {
  const row = object(value);
  return row.operation === operation && typeof row.exitCode === 'number' && Number.isInteger(row.exitCode);
};
const probes: { id: CapabilityReading['id']; label: string; path: string; valid: (value: unknown) => boolean }[] = [
  {
    id: 'server-status',
    label: 'Server status',
    path: '/api/server/status?raw=0',
    valid: (v) => {
      const summary = object(object(v).data).summary;
      return Boolean(
        summary && typeof summary === 'object' && !Array.isArray(summary) && object(v).schemaVersion === 1,
      );
    },
  },
  {
    id: 'readiness',
    label: 'Service readiness',
    path: '/api/server/readiness',
    valid: (v) =>
      ['ready', 'waiting', 'failed', 'unknown'].includes(String(object(v).status)) && Array.isArray(object(v).checks),
  },
  { id: 'services', label: 'Service list', path: '/api/server/services', valid: command('services') },
  {
    id: 'performance',
    label: 'Performance snapshot',
    path: '/api/server/performance',
    valid: (v) => ['cpu', 'memory', 'disk'].some((key) => key in object(v)),
  },
  {
    id: 'restart-queue',
    label: 'Restart queue',
    path: '/api/server/restart-queue',
    valid: (v) => projectRestartQueue(v) !== null,
  },
  {
    id: 'restart-history',
    label: 'Restart history',
    path: '/api/server/restart-history',
    valid: (v) => projectRestartHistory(v) !== null,
  },
  {
    id: 'restart-schedule',
    label: 'Daily restart schedule',
    path: '/api/server/restart-schedule',
    valid: command('restartScheduleStatus'),
  },
  {
    id: 'ip-change-restart',
    label: 'IP-change restart monitor',
    path: '/api/server/ip-change-restart',
    valid: command('ipChangeRestartStatus'),
  },
  {
    id: 'population',
    label: 'Online population',
    path: '/api/players/online?page=0&pageSize=1',
    valid: (v) => {
      const n = object(v).totalCount;
      return (
        (typeof n === 'number' || (typeof n === 'string' && /^\d+$/.test(n))) &&
        Number.isSafeInteger(Number(n)) &&
        Number(n) >= 0
      );
    },
  },
  {
    id: 'database-backups',
    label: 'Database backup inventory',
    path: '/api/backups',
    valid: (v) => projectDatabaseBackups(v) !== null,
  },
  {
    id: 'system-backups',
    label: 'System backup inventory',
    path: '/api/backups/system',
    valid: (v) => projectSystemBackups(v) !== null,
  },
  {
    id: 'backup-schedule',
    label: 'System backup schedule',
    path: '/api/backups/system/auto',
    valid: (v) => projectBackupStatus(v) !== null,
  },
  {
    id: 'database-backup-schedule',
    label: 'Database backup schedule',
    path: '/api/backups/auto',
    valid: (v) => object(object(v).status).ok === true && typeof object(object(v).status).enabled === 'boolean',
  },
];

function classify(error: unknown): CapabilityState {
  if (!(error instanceof DuneConsoleApiError)) return 'unavailable';
  if (error.status === 401 || error.status === 403) return 'permission';
  if (error.status === 501) return 'unsupported';
  if (error.status === 429) return 'rate-limited';
  return 'unavailable';
}

export function readCapabilities(): Promise<CapabilityReading[]> {
  const now = Date.now();
  if (cache && cache.until > now) return cache.value;
  const value = Promise.all(
    probes.map(async (probe): Promise<CapabilityReading> => {
      let state: CapabilityState;
      try {
        const response = await getDuneClient().request('GET', probe.path, { timeoutMs: 5000, retryRead: false });
        state = probe.valid(response) ? 'available' : 'unavailable';
      } catch (error) {
        state = classify(error);
      }
      const checkedAt = new Date().toISOString();
      if (state === 'available') lastSuccess.set(probe.id, checkedAt);
      const previousSuccess = lastSuccess.get(probe.id) ?? null;
      return {
        id: probe.id,
        label: probe.label,
        state,
        checkedAt,
        lastSuccessAt: previousSuccess,
        stale: Boolean(
          previousSuccess && state !== 'available' && Date.parse(checkedAt) - Date.parse(previousSuccess) > 900_000,
        ),
      };
    }),
  );
  cache = { until: now + 60000, value };
  return value;
}
