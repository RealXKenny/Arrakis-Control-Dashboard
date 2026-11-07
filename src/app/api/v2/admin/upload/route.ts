import { assertSameOrigin, route } from '../../../../../server/http';
import { requireApiAdmin } from '../../../../../server/admin/access';
import { executeAdminOperation } from '../../../../../server/admin/execute';
import { readAdminUpload } from '../../../../../server/admin/upload';

export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const session = await requireApiAdmin();
  const { parsed, upload } = await readAdminUpload(request);
  return executeAdminOperation(parsed, session, { signal: request.signal, upload });
});
