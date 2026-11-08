import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import type { DashboardSession } from '../../auth/server/session-store';
import { parseAdminRequest } from './request';
import { summarizeAdminMetrics, type AdminOverview, type AdminSource } from '../overview';
import { executeAdminOperation, isSecureConsoleOrigin } from './execute';

const sources = [
  ['get-server-status', 'Server health'],
  ['get-server-performance', 'Performance'],
  ['get-server-services', 'Services'],
  ['get-players-online', 'Online players'],
  ['get-players', 'Players'],
  ['get-guilds', 'Guilds'],
  ['get-bases', 'Bases'],
  ['get-vehicles', 'Vehicles'],
  ['get-maps', 'Maps'],
  ['get-backups', 'Game backups'],
] as const;
const paginated = new Set(['get-players-online', 'get-players', 'get-guilds', 'get-bases', 'get-vehicles']);

/** Bounded fan-out over the Console reads that feed the overview; one failing source never fails the page. */
export async function loadAdminOverview(session: DashboardSession, signal?: AbortSignal): Promise<AdminOverview> {
  const env = getServerEnv();
  const secure = isSecureConsoleOrigin(env.CONSOLE_URL);
  const setup: AdminOverview['setup'] = [
    {
      id: 'console',
      label: 'Console connection',
      ready: !!env.CONSOLE_URL && secure,
      instruction: 'Set CONSOLE_URL to your HTTPS Console address. Loopback HTTP is supported for local deployments.',
    },
    {
      id: 'admin-key',
      label: 'Administrative credential',
      ready: !!env.ADMIN_CONSOLE_API_KEY,
      instruction:
        'Set ADMIN_CONSOLE_API_KEY to a separate Console API key with the read and write scopes your admin tools need. Restart after changing environment settings.',
    },
    {
      id: 'adapter',
      label: 'Discord adapter',
      ready: !!env.ADAPTER_TOKEN,
      instruction:
        'Set ADAPTER_TOKEN for the experimental Discord adapter tools. Keep it separate from both Console API keys.',
    },
    {
      id: 'redis',
      label: 'Persistent storage',
      ready: !!env.REDIS_URL,
      instruction: 'Configure REDIS_URL for sessions, applications, support messages, and rate limits.',
    },
    {
      id: 'identity',
      label: 'Administrator session',
      ready: true,
      instruction: 'This session passed the configured Discord identity, guild, role, and expiry checks.',
    },
  ];
  const readings: Record<string, unknown> = {};
  const results: AdminSource[] = new Array(sources.length);
  let next = 0;
  async function worker() {
    while (next < sources.length) {
      const index = next++;
      const [operation, label] = sources[index];
      if (!env.ADMIN_CONSOLE_API_KEY || !secure) {
        results[index] = {
          operation,
          label,
          state: 'unconfigured',
          status: null,
          durationMs: 0,
          error: 'Finish Console connection and administrative credential setup.',
        };
        continue;
      }
      const start = performance.now();
      try {
        const response = await executeAdminOperation(
          parseAdminRequest({ operation, ...(paginated.has(operation) ? { query: { page: 0, pageSize: 1 } } : {}) }),
          session,
          { signal, timeoutMs: 6000 },
        );
        const payload = (await response.json()) as { ok?: boolean; data?: unknown; upstreamStatus?: number };
        const ready = response.status < 400 && payload.ok === true;
        if (ready) readings[operation] = payload.data;
        results[index] = {
          operation,
          label,
          state: ready ? 'ready' : 'error',
          status: payload.upstreamStatus ?? response.status,
          durationMs: Math.round(performance.now() - start),
          ...(!ready
            ? {
                error:
                  response.status === 403
                    ? 'The admin key is missing the scope for this read.'
                    : 'Console did not return a successful reading.',
              }
            : {}),
        };
      } catch {
        results[index] = {
          operation,
          label,
          state: 'error',
          status: null,
          durationMs: Math.round(performance.now() - start),
          error: 'Connection failed or the read timed out. Check the Console connection and key permissions.',
        };
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  return {
    observedAt: new Date().toISOString(),
    ...summarizeAdminMetrics(readings),
    sources: results,
    setup,
  };
}
