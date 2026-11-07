import { requireApiAdmin } from '../../../../../server/admin/access';
import { loadAdminOverview } from '../../../../../server/admin/overview';
import { json, route } from '../../../../../server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  const session = await requireApiAdmin();
  return json({ ok: true, data: await loadAdminOverview(session, request.signal) });
});
