import { requireApiAdmin } from '../../../../../features/admin/server/api-access';
import { adminCatalog } from '../../../../../features/admin/server/catalog';
import { json, route } from '../../../../../server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireApiAdmin();
  return json(adminCatalog());
});
