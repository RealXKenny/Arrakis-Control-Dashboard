import { requireApiAdmin } from '../../../../../features/admin/server/api-access';
import { readAudit } from '../../../../../lib/security/audit';
import { json, route } from '../../../../../server/http';

export const dynamic = 'force-dynamic';

/** Newest-first security audit events, for administrators only. Entries hold identifiers and outcomes, never secrets. */
export const GET = route(async (request) => {
  await requireApiAdmin();
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 100);
  return json({ ok: true, events: await readAudit(Number.isFinite(limit) ? limit : 100) });
});
