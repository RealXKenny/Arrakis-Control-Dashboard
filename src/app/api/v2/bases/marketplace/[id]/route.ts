import { AppError } from '../../../../../../lib/errors';
import { deleteBase, getBase } from '../../../../../../features/bases/server/marketplace';
import { ownerKeysForId } from '../../../../../../features/bases/server/owner-key';
import { assertSameOrigin, json, requireApiSession, route } from '../../../../../../server/http';
import { spendReadBudget } from '../../../../../../server/read-budget';

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, { params }: Context) => {
  await requireApiSession();
  const budget = await spendReadBudget();
  if (!budget.allowed) {
    throw new AppError('Too many reads. Slow down.', 429, 'RATE_LIMITED', true);
  }
  const record = await getBase((await params).id);
  if (!record) throw new AppError('Base not found.', 404, 'NOT_FOUND', true);

  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (new URL(request.url).searchParams.get('download') === '1') {
    const filename = record.summary.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'base';
    headers['Content-Disposition'] = `attachment; filename="${filename}.json"`;
  }
  // Ownership keys are an internal detail; the download is the portable layout only.
  const { ownerKey: _ownerKey, ...summary } = record.summary;
  return json({ summary, layout: record.layout }, 200, headers);
});

export const DELETE = route(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const session = await requireApiSession();
  const removed = await deleteBase((await params).id, ownerKeysForId(session.user.id));
  // Same answer for "not yours" and "not there", so ownership cannot be probed.
  if (!removed) throw new AppError('Base not found.', 404, 'NOT_FOUND', true);
  return json({ ok: true });
});
