import { assertSameOrigin, route } from '../../../../../server/http';
import { requireRecentSignIn } from '../../../../../features/admin/server/access';
import { requireApiAdmin, spendAdminBudget } from '../../../../../features/admin/server/api-access';
import { executeAdminOperation } from '../../../../../features/admin/server/execute';
import { readAdminUpload } from '../../../../../features/admin/server/upload';

export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const session = await requireApiAdmin();
  // Uploads replace data on the server (backups, blueprints, plans): always high risk.
  requireRecentSignIn(session, { highRisk: true });
  await spendAdminBudget(session);
  const { parsed, upload } = await readAdminUpload(request);
  return executeAdminOperation(parsed, session, { signal: request.signal, upload });
});
