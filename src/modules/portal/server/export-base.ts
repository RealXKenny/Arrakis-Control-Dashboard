import '../../../lib/assert-server';
import { record } from '../utils/inventory';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { NextResponse } from '../../../infrastructure/pages-api';
import { cookies } from '../../../infrastructure/cookies';

import { getDuneClient } from '../../../infrastructure/dune';
import { getServerEnv } from '../../../config/env';
import { getSession } from '../../../lib/session-store';

export async function GET(request, res) {
  try {
    const sessionId = cookies(request, res).get('dashboard_session')?.value;
    const session = sessionId ? await getSession(sessionId) : null;

    if (!sessionId || !session || session.expiresAt < Date.now()) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const baseId = request.query.baseId;
    if (typeof baseId !== 'string' || !baseId || baseId.length > 128) {
      return NextResponse.json({ ok: false, error: 'Missing base ID' }, { status: 400 });
    }

    const linkedPlayer = await getLinkedPlayer({
      guildId: session.guildId,
      channelId: 'dashboard',
      userId: session.user.id,
      username: session.user.username,
      roleIds: [...(session.roleIds || []), getServerEnv().VERIFIED_MEMBER_ROLE_ID].filter(Boolean),
      interactionId: `dashboard-${Date.now()}`,
      commandName: 'portal',
    });
    const playerId = linkedPlayer?.pawnId ?? linkedPlayer?.controllerId;
    if (!linkedPlayer?.linked || !playerId)
      return NextResponse.json({ error: 'Character not linked' }, { status: 403 });
    const client = getDuneClient();
    const response = await client.request('GET', `/api/players/${encodeURIComponent(playerId)}/bases`);
    const bases = Array.isArray(response) ? response : (record(response).rows ?? record(response).data ?? []);
    // Scope the administrative export endpoint to this linked player's own bases.
    const owned =
      Array.isArray(bases) &&
      bases.some(
        (base) =>
          String(base.base_id ?? base.baseId ?? base.id ?? '') === baseId &&
          (['owner', 'owned', 'self', 'own'].includes(
            String(base.relationship ?? base.relation ?? base.access ?? '').toLowerCase(),
          ) ||
            String(base.owner_id ?? base.ownerId ?? base.owner?.id ?? '') === String(playerId)),
      );
    if (!owned) return NextResponse.json({ error: 'You do not own this base' }, { status: 403 });
    const blueprint = await client.request('GET', `/api/bases/${encodeURIComponent(baseId)}/export`);

    return new NextResponse(JSON.stringify(blueprint, null, 2), {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="base-${String(baseId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Unable to export base' }, { status: 502 });
  }
}
