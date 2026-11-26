import { z } from 'zod';
import { mutation } from '../../../../../features/casino/server/request';
import { casinoHistory, openRounds, startCasinoRound } from '../../../../../features/casino/server/service';
import { json, requireApiSession, route } from '../../../../../server/http';

const startSchema = z
  .object({
    game: z.string().max(40),
    wager: z.string().max(14),
    params: z.unknown().optional(),
    idempotencyKey: z.string().max(64),
  })
  .strict();

export const GET = route(async (request: Request) => {
  const session = await requireApiSession();
  const query = new URL(request.url).searchParams;
  if (query.get('status') === 'open') return json({ ok: true, rounds: await openRounds(session) });
  const limit = Number(query.get('limit') ?? 25);
  return json({ ok: true, rounds: await casinoHistory(session, Number.isFinite(limit) ? limit : 25) });
});

export const POST = route(async (request: Request) => {
  const { session, input } = await mutation(request, startSchema);
  return json({ ok: true, round: await startCasinoRound(session, input) });
});
