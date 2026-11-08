import { assertSameOrigin, route } from '../../../../../server/http';
import { requireApiAdmin } from '../../../../../features/admin/server/api-access';
import { executeAdminOperation } from '../../../../../features/admin/server/execute';
import { readAdminUpload } from '../../../../../features/admin/server/upload';

export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const session = await requireApiAdmin();
  const { parsed, upload } = await readAdminUpload(request);
  return executeAdminOperation(parsed, session, { signal: request.signal, upload });
});
