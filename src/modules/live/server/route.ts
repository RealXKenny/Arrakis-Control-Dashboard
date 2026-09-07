import { getServerEnv } from '../../../config/env';
import { cookies } from '../../../infrastructure/cookies';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getSession } from '../../../lib/session-store';
import { liveStore } from './store';
import type { LiveEvent, LiveReading } from '../types';

export async function GET(req, res) {
  const id = cookies(req, res).get('dashboard_session')?.value;
  const session = id ? await getSession(id) : null;
  if (!session || session.expiresAt <= Date.now())
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const env = getServerEnv();
  const admin = session.roleIds.some((role) =>
    env.LIVE_EVENTS_ADMIN_ROLE_IDS.split(',').filter(Boolean).includes(role),
  );
  const reading: LiveReading = { enabled: env.LIVE_EVENTS_ENABLED === 'true', admin, connectedAt: null, events: [] };
  if (reading.enabled) {
    const { redis, prefix } = liveStore();
    reading.connectedAt = await redis.get<number>(`${prefix}:connected`);
    const kinds = admin ? ['status', 'chat', 'activity', 'observation'] : ['status'];
    const histories = await Promise.all(kinds.map((kind) => redis.lrange<LiveEvent>(`${prefix}:${kind}`, 0, 99)));
    reading.events = histories
      .flat()
      .filter((event) => event.receivedAt > Date.now() - 86400000)
      .sort((a, b) => b.receivedAt - a.receivedAt);
  }
  return NextResponse.json(reading, { headers: { 'Cache-Control': 'private, no-store' } });
}
