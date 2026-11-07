import { requireApiAdmin } from '../../../../../server/admin/access';
import { adminCatalog } from '../../../../../server/admin/catalog';
import { json, route } from '../../../../../server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireApiAdmin();
  return json(adminCatalog());
});
