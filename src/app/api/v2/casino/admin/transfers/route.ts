import { z } from 'zod';
import { requireApiAdmin, spendAdminBudget } from '../../../../../../features/admin/server/api-access';
import { requireRecentSignIn } from '../../../../../../features/admin/server/access';
import { ID_PATTERN, mutation } from '../../../../../../features/casino/server/request';
import {
  adminResolveTransfer,
  adminTransfersAwaitingReconciliation,
} from '../../../../../../features/casino/server/service';
import { json, route } from '../../../../../../server/http';

const schema = z
  .object({
    owner: z.string().regex(ID_PATTERN),
    id: z.string().regex(ID_PATTERN),
    resolution: z.enum(['applied', 'not_applied']),
    note: z.string().max(500),
  })
  .strict();

/** Transfers whose outcome is unknown, for an administrator to settle by hand. */
export const GET = route(async () => {
  const admin = await requireApiAdmin();
  await spendAdminBudget(admin);
  return json({ ok: true, transfers: await adminTransfersAwaitingReconciliation() });
});

/**
 * Record what really happened to an uncertain transfer. High risk: it decides whether real Solaris is credited or
 * released, so it needs a fresh interactive sign-in on top of the administrator check.
 */
export const POST = route(async (request: Request) => {
  const admin = await requireApiAdmin();
  const { input } = await mutation(request, schema, 2 * 1024);
  requireRecentSignIn(admin, { highRisk: true });
  await spendAdminBudget(admin);
  return json({ ok: true, transfer: await adminResolveTransfer(admin, input, input.resolution, input.note) });
});
