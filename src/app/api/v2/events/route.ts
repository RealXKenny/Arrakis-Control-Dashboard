import { requireApiSession, route, json } from '../../../../server/http';
import { listCommunityEvents } from '../../../../features/events/server/store';

export const dynamic = 'force-dynamic';
export const GET = route(async () => {
  await requireApiSession();
  return json({ ok: true, events: await listCommunityEvents() });
});
