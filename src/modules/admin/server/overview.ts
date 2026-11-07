import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { NextResponse } from '../../../infrastructure/pages-api';
import { requireDashboardAdmin } from './access';
import { executeOperation } from './execute';
import { parseAdminRequest } from './request';
import { summarizeAdminMetrics, type AdminOverview, type AdminSource } from '../overview';

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
export async function GET(req, res) {
  const session = await requireDashboardAdmin(req, res);
  const env = getServerEnv();
  let secure = false;
  try {
    const url = new URL(env.CONSOLE_URL ?? '');
    secure =
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch {
    /* Setup reports missing or invalid origins without exposing them. */
  }
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
        const response = await executeOperation(
          parseAdminRequest({ operation, ...(paginated.has(operation) ? { query: { page: 0, pageSize: 1 } } : {}) }),
          session,
          res,
          undefined,
          { timeoutMs: 6000 },
        );
        const payload = JSON.parse(response.body ?? '{}');
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
  const data: AdminOverview = {
    observedAt: new Date().toISOString(),
    ...summarizeAdminMetrics(readings),
    sources: results,
    setup,
  };
  return NextResponse.json({ ok: true, data });
}
