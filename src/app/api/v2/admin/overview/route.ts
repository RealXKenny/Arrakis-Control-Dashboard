import { requireApiAdmin } from '../../../../../features/admin/server/api-access';
import { loadAdminOverview } from '../../../../../features/admin/server/overview';
import { json, route } from '../../../../../server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  const session = await requireApiAdmin();
  return json({ ok: true, data: await loadAdminOverview(session, request.signal) });
});
