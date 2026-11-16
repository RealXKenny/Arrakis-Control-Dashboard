import '../../../lib/assert-server';
import { DuneConsoleApiError, getDuneClient } from '../../../server/integrations/dune';
import type { CapabilityReading, CapabilityState } from '../capabilities';
import { projectRestartQueue } from '../restart-queue';

const lastSuccess = new Map<CapabilityReading['id'], string>();
let cache: { until: number; value: Promise<CapabilityReading[]> } | undefined;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
    id: 'restart-queue',
    label: 'Restart queue',
    path: '/api/server/restart-queue',
    valid: (v) => projectRestartQueue(v) !== null,
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
      return { id: probe.id, label: probe.label, state, checkedAt, lastSuccessAt: lastSuccess.get(probe.id) ?? null };
    }),
  );
  cache = { until: now + 60000, value };
  return value;
}
