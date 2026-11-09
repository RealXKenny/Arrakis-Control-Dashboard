import { z } from 'zod';
import { AppError } from '../../../../../../../lib/errors';
import { ID_PATTERN, mutation } from '../../../../../../../features/casino/server/request';
import { actCasinoRound } from '../../../../../../../features/casino/server/service';
import { json, route } from '../../../../../../../server/http';

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { session, input } = await mutation(request, z.object({ action: z.unknown() }).strict(), 2 * 1024);
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) throw new AppError('Round not found.', 404, 'NOT_FOUND', true);
  return json({ ok: true, round: await actCasinoRound(session, id, input.action) });
});
