import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { getDuneClient } from '../../../server/integrations/dune';
import { isSecureConsoleOrigin } from '../../../server/integrations/console-origin';
import type { DashboardSession } from '../../auth/server/session-store';
import { getLinkedPlayer } from '../../player/server/linked-player';
import type { MapName } from '../maps';
import { ReadCache } from '../../../lib/cache/read-cache';

// Provider responses are server-only and shared briefly to coalesce concurrent viewers.
const reads = new ReadCache<unknown>(
  (value) => JSON.stringify(value).length,
  () => true,
  { ttlMs: 1000, maxEntries: 6, maxPending: 6 },
);
export function clearLivePlayerCache() {
  reads.clear();
}

const sourceMaps: Record<MapName, string> = {
  HaggaBasin: 'Survival_1',
  DeepDesert: 'DeepDesert_1',
  Arrakeen: 'SH_Arrakeen',
  HarkoVillage: 'SH_HarkoVillage',
  Overland: 'Overmap',
};
type Position = { x: number; y: number; z: number; partition: number };
const finitePosition = (v: Record<string, unknown>) =>
  [v.x, v.y, v.z].every((n) => typeof n === 'number' && Number.isFinite(n));

/** Anonymous agent positions have no canonical identity. Match only a single-player partition. */
export function matchLivePlayer(
  roster: unknown,
  snapshot: unknown,
  map: MapName,
  pawn: string,
  now: number,
): Position | null {
  if (!roster || typeof roster !== 'object' || !snapshot || typeof snapshot !== 'object') return null;
  const rows = (roster as Record<string, unknown>).rows;
  const capabilities = (roster as Record<string, unknown>).capabilities as Record<string, unknown> | undefined;
  const agent = snapshot as Record<string, unknown>;
  if (
    capabilities?.players !== true ||
    !Array.isArray(rows) ||
    rows.length > 10000 ||
    !Array.isArray(agent.sources) ||
    agent.sources.length > 256 ||
    !Array.isArray(agent.objects) ||
    agent.objects.length > 50000 ||
    typeof agent.t !== 'number' ||
    !Number.isFinite(agent.t) ||
    agent.t > now + 1000 ||
    now - agent.t > 5000
  )
    return null;
  const online = rows.filter(
    (r): r is Record<string, unknown> =>
      !!r &&
      typeof r === 'object' &&
      !Array.isArray(r) &&
      r.type === 'player' &&
      r.map === map &&
      typeof r.online_status === 'string' &&
      r.online_status.toLowerCase().trim() === 'online',
  );
  const own = online.filter((r) => String(r.id ?? '') === pawn);
  // An unknown partition could be the same instance, so it cannot be excluded safely.
  if (
    online.some(
      (r) => typeof r.partition_id !== 'number' || !Number.isSafeInteger(r.partition_id) || r.partition_id < 0,
    )
  )
    return null;
  if (
    own.length !== 1 ||
    !finitePosition(own[0]) ||
    typeof own[0].partition_id !== 'number' ||
    !Number.isSafeInteger(own[0].partition_id) ||
    own[0].partition_id < 0
  )
    return null;
  const partition = own[0].partition_id;
  if (online.filter((r) => r.partition_id === partition).length !== 1) return null;
  const sources = agent.sources as unknown[];
  const sourceIndexes = sources.flatMap((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return [];
    const v = s as Record<string, unknown>;
    return v.map === sourceMaps[map] && v.partition === partition && v.ready === true ? [i] : [];
  });
  if (sourceIndexes.length !== 1) return null;
  const players = (agent.objects as unknown[]).filter(
    (o): o is Record<string, unknown> =>
      !!o &&
      typeof o === 'object' &&
      !Array.isArray(o) &&
      (o as Record<string, unknown>).k === 'player' &&
      (o as Record<string, unknown>).s === sourceIndexes[0],
  );
  if (players.length !== 1 || !finitePosition(players[0])) return null;
  const p = players[0];
  if (Math.hypot((p.x as number) - (own[0].x as number), (p.y as number) - (own[0].y as number)) > 30000) return null;
  return { x: p.x as number, y: p.y as number, z: p.z as number, partition };
}

export async function readLivePlayer(
  session: DashboardSession,
  map: MapName,
): Promise<(Position & { pawnId: string }) | null> {
  const env = getServerEnv();
  if (session.guildId !== env.DISCORD_GUILD_ID || !isSecureConsoleOrigin(env.DUNE_API_URL)) return null;
  const actor = {
    guildId: session.guildId,
    channelId: 'dashboard',
    userId: session.user.id,
    username: session.user.username,
    roleIds: session.roleIds || [],
    interactionId: `map-live-${Date.now()}`,
    commandName: 'portal',
  };
  try {
    const link = await getLinkedPlayer(actor);
    const pawn = String(link?.pawnId ?? '').trim();
    if (!link?.linked || !/^[A-Za-z0-9_-]{1,128}$/.test(pawn)) return null;
    const client = getDuneClient();
    const [roster, snapshot] = await Promise.all([
      reads.get(`players:${map}`, () =>
        client.request('GET', `/api/map/players?map=${encodeURIComponent(map)}`, { timeoutMs: 5000, retryRead: false }),
      ),
      reads.get('agent', () => client.request('GET', '/api/realtime/objects', { timeoutMs: 5000, retryRead: false })),
    ]);
    const verified = await getLinkedPlayer(actor);
    if (
      !verified?.linked ||
      String(verified.pawnId ?? '') !== pawn ||
      String(verified.controllerId ?? '') !== String(link.controllerId ?? '')
    )
      return null;
    const position = matchLivePlayer(roster.data, snapshot.data, map, pawn, Date.now());
    return position ? { ...position, pawnId: pawn } : null;
  } catch {
    return null;
  }
}
