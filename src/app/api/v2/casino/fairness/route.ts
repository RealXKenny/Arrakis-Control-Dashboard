import { z } from 'zod';
import { mutation } from '../../../../../features/casino/server/request';
import { changeClientSeed, fairnessState, rotateOwnSeed } from '../../../../../features/casino/server/service';
import { json, requireApiSession, route } from '../../../../../server/http';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rotate'), clientSeed: z.string().max(64).optional() }).strict(),
  z.object({ action: z.literal('client-seed'), clientSeed: z.string().max(64) }).strict(),
]);

/** Public seed state: commitment, client seed, nonce and retired seeds. The active server seed is never returned. */
export const GET = route(async () => {
  const session = await requireApiSession();
  return json({ ok: true, fairness: await fairnessState(session) });
});

export const POST = route(async (request: Request) => {
  const { session, input } = await mutation(request, schema, 1024);
  if (input.action === 'rotate') {
    const result = await rotateOwnSeed(session, input.clientSeed || undefined);
    return json({ ok: true, ...result, fairness: await fairnessState(session) });
  }
  await changeClientSeed(session, input.clientSeed);
  return json({ ok: true, fairness: await fairnessState(session) });
});
