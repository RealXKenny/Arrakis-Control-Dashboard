import '../lib/assert-server';
import { getDuneClient } from '../infrastructure/dune';
import { ReadCache } from '../lib/cache/read-cache';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import type { DashboardSession } from '../lib/security/session-store';
import { getLinkedPlayer } from '../modules/player/server/linked-player';
import { normalizeVehicles, type Vehicle } from '../features/vehicles/normalize';
import { spendReadBudget } from './read-budget';

export type VehiclesResult =
  | { status: 'ok'; vehicles: Vehicle[]; playerName: string }
  | { status: 'unlinked' }
  | { status: 'limited'; retryAfter: number }
  | { status: 'unavailable'; message: string };

const playerVehicles = new ReadCache<Vehicle[]>(
  (value) => JSON.stringify(value).length,
  () => true,
  { ttlMs: 15_000, maxEntries: 200 },
);

async function resolvePlayer(session: DashboardSession): Promise<{ id: string; name: string } | null> {
  if (session.linkedPlayerId && session.linkedPlayerName) {
    return { id: session.linkedPlayerId, name: session.linkedPlayerName };
  }
  const player = await getLinkedPlayer({
    guildId: session.guildId,
    channelId: 'dashboard',
    userId: session.user.id,
    username: session.user.username,
    roleIds: session.roleIds ?? [],
    interactionId: `vehicles-${Date.now()}`,
    commandName: 'portal',
  });
  const id = player.pawnId ?? player.controllerId;
  if (!player.linked || id === null || id === undefined || !player.characterName) return null;
  return { id: String(id), name: player.characterName };
}

export async function loadVehicles(session: DashboardSession): Promise<VehiclesResult> {
  const budget = await spendReadBudget();
  if (!budget.allowed) return { status: 'limited', retryAfter: budget.retryAfter };

  try {
    const player = await resolvePlayer(session);
    if (!player) return { status: 'unlinked' };

    const entry = await playerVehicles.get(`vehicles:${player.id}`, async () => {
      const raw = await getDuneClient().request('GET', `/api/players/${encodeURIComponent(player.id)}/vehicles`);
      return normalizeVehicles(raw, player.name);
    });
    return { status: 'ok', vehicles: entry.data, playerName: player.name };
  } catch (error) {
    if (error instanceof AppError && error.expose) return { status: 'unavailable', message: error.message };
    logger.error('Unable to load vehicles', error);
    return { status: 'unavailable', message: 'Vehicle data is unreachable right now. Try again shortly.' };
  }
}
