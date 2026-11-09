import { AppError } from '../../../../../../lib/errors';
import { ID_PATTERN } from '../../../../../../features/casino/server/request';
import { viewCasinoRound } from '../../../../../../features/casino/server/service';
import { json, requireApiSession, route } from '../../../../../../server/http';

export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const session = await requireApiSession();
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) throw new AppError('Round not found.', 404, 'NOT_FOUND', true);
  return json({ ok: true, round: await viewCasinoRound(session, id) });
});
