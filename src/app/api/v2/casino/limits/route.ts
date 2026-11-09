import { z } from 'zod';
import { mutation } from '../../../../../features/casino/server/request';
import { PAUSE_HOURS, pausePlay, pausedUntil, ownerOf } from '../../../../../features/casino/server/service';
import { json, requireApiSession, route } from '../../../../../server/http';

export const GET = route(async () => {
  const session = await requireApiSession();
  return json({ ok: true, pausedUntil: (await pausedUntil(ownerOf(session))) || null, options: PAUSE_HOURS });
});

/** A voluntary break from play. It can be extended but never shortened. */
export const POST = route(async (request: Request) => {
  const { session, input } = await mutation(request, z.object({ pauseHours: z.number().int() }).strict(), 512);
  return json({ ok: true, ...(await pausePlay(session, input.pauseHours)) });
});
