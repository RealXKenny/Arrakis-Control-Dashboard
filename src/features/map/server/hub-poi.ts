import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { getDuneClient } from '../../../server/integrations/dune';
import { isSecureConsoleOrigin } from '../../../server/integrations/console-origin';
import { clearSharedMemory, readShared, type CachePolicy } from '../../../lib/cache/shared-cache';
import type { DashboardSession } from '../../auth/server/session-store';
import type { MapName } from '../maps';

export type HubPoi = { id: string; subtype: string; x: number; y: number };

// Static points of interest are game metadata: one shared reading refreshed every six hours, kept for a week.
const policy: CachePolicy<HubPoi[]> = {
  name: 'hub-poi',
  version: 1,
  freshMs: 6 * 3_600_000,
  retainMs: 7 * 86_400_000,
  validate: (raw) => {
    if (Array.isArray(raw)) return parseHubPoi({ rows: raw.map((point) => ({ ...point, type: 'poi' })) });
    const data = (raw as { data?: unknown } | null)?.data;
    // A response without a rows array is malformed and never replaces a good reading; an empty array is legitimate.
    if (!data || typeof data !== 'object' || !Array.isArray((data as { rows?: unknown }).rows)) return undefined;
    return parseHubPoi(data);
  },
};
export function clearHubPoiCache() {
  clearSharedMemory(policy);
}

/** Keep only bounded static points of interest; players, vehicles, bases and storage never pass through. */
export function parseHubPoi(data: unknown): HubPoi[] {
  const rows = data && typeof data === 'object' ? (data as Record<string, unknown>).rows : null;
  if (!Array.isArray(rows) || rows.length > 5000) return [];
  const out: HubPoi[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    if (r.type !== 'poi' && r.type !== 'house_representative') continue;
    const subtype = typeof r.subtype === 'string' ? r.subtype : typeof r.name === 'string' ? r.name : '';
    if (!/^[A-Za-z0-9]{1,64}$/.test(subtype) || typeof r.x !== 'number' || typeof r.y !== 'number') continue;
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    const id = `${subtype}:${Math.round(r.x)}:${Math.round(r.y)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, subtype, x: r.x, y: r.y });
    if (out.length >= 200) break;
  }
  return out;
}

export async function readHubPoi(session: DashboardSession, map: MapName): Promise<HubPoi[] | null> {
  const env = getServerEnv();
  if (session.guildId !== env.DISCORD_GUILD_ID || !isSecureConsoleOrigin(env.DUNE_API_URL)) return null;
  try {
    const reading = await readShared(policy, [map], () =>
      getDuneClient().request('GET', `/api/map/poi?map=${encodeURIComponent(map)}`, {
        timeoutMs: 8000,
        retryRead: false,
      }),
    );
    return reading.data;
  } catch {
    return null;
  }
}
