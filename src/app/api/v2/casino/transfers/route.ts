import { z } from 'zod';
import { mutation } from '../../../../../features/casino/server/request';
import { ownTransfers, startSolarisTransfer } from '../../../../../features/casino/server/service';
import { json, requireApiSession, route } from '../../../../../server/http';

const schema = z
  .object({
    kind: z.enum(['deposit', 'withdrawal']),
    amount: z.string().max(14),
    idempotencyKey: z.string().max(64),
  })
  .strict();

export const GET = route(async () => {
  const session = await requireApiSession();
  return json({ ok: true, transfers: await ownTransfers(session) });
});

/**
 * Start a Solaris deposit or withdrawal for the signed-in member's own, freshly verified game character.
 * The body names no player, currency or server; they are derived on the server.
 */
export const POST = route(async (request: Request) => {
  const { session, input } = await mutation(request, schema, 1024);
  return json({ ok: true, transfer: await startSolarisTransfer(session, input) });
});
