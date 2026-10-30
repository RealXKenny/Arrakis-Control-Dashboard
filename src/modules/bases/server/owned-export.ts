import '../../../lib/assert-server';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getDuneClient } from '../../../infrastructure/dune';
import { cookies } from '../../../infrastructure/cookies';
import { AppError } from '../../../lib/errors';
import { getSession } from '../../../lib/session-store';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { record } from '../../portal/utils/inventory';

export async function ownedBaseContext(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const linkedPlayer = await getLinkedPlayer({
    guildId: session.guildId,
    channelId: 'dashboard',
    userId: session.user.id,
    username: session.user.username,
    roleIds: session.roleIds || [],
    interactionId: `dashboard-${Date.now()}`,
    commandName: 'portal',
  });
  const playerId = linkedPlayer?.pawnId ?? linkedPlayer?.controllerId;
  if (!linkedPlayer?.linked || !playerId) throw new AppError('Character not linked', 403, 'PLAYER_UNAVAILABLE', true);

  const client = getDuneClient();
  const response = await client.request('GET', `/api/players/${encodeURIComponent(playerId)}/bases`);
  const bases = Array.isArray(response) ? response : (record(response).rows ?? record(response).data ?? []);
  // Dev note: export your own fortress; neighboring castles are not party favors.
  const ids = Array.isArray(bases)
    ? bases.slice(0, 500).flatMap((value) => {
        const base = record(value);
        const id = String(base.base_id ?? base.baseId ?? base.id ?? '');
        return id &&
          id.length <= 128 &&
          (['owner', 'owned', 'self', 'own'].includes(
            String(base.relationship ?? base.relation ?? base.access ?? '').toLowerCase(),
          ) ||
            String(base.owner_id ?? base.ownerId ?? record(base.owner).id ?? '') === String(playerId))
          ? [id]
          : [];
      })
    : [];
  return { ids, client, linkedPlayer };
}

export async function requireOwnedBaseExport(req: NextApiRequest, res: NextApiResponse) {
  const sessionId = cookies(req, res).get('dashboard_session')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!sessionId || !session || session.expiresAt <= Date.now())
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED', true);
  const baseId = req.query.baseId;
  if (typeof baseId !== 'string' || !baseId || baseId.length > 128)
    throw new AppError('Missing base ID', 400, 'INVALID_BASE_ID', true);
  const { ids, client, linkedPlayer } = await ownedBaseContext(session);
  if (!ids.includes(baseId)) throw new AppError('You do not own this base', 403, 'FORBIDDEN', true);
  const blueprint = await client.request('GET', `/api/bases/${encodeURIComponent(baseId)}/export`);
  return { blueprint, linkedPlayer, session };
}
