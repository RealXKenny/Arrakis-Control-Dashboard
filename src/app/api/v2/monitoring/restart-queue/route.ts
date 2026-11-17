import { json, requireApiSession, route } from '../../../../../server/http';
import { readRestartQueue } from '../../../../../features/monitoring/server/restart-queue';

export const dynamic = 'force-dynamic';
export const GET = route(async () => {
  await requireApiSession();
  try {
    return json({ ok: true, ...(await readRestartQueue()), serverTime: Date.now() });
  } catch {
    return json({ ok: false, error: 'Restart information is unavailable.' }, 503);
  }
});
