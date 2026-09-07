import '../../../lib/assert-server';
import { z } from 'zod';
import { getDiscordPlayer } from '../../../infrastructure/dune';
import { AppError } from '../../../lib/errors';
const id = z.union([z.string(), z.number().int().safe()]);
const linkedPlayerSchema = z.object({
  linked: z.boolean(),
  onlineStatus: z.string().nullable().optional(),
  ok: z.boolean().optional(),
  pawnId: id.optional().nullable(),
  controllerId: id.optional().nullable(),
  characterName: z.string().optional(),
  online: z.boolean().optional(),
});
export function normalizeLinkedPlayer(value: unknown) {
  const parsed = linkedPlayerSchema.safeParse(value);
  if (!parsed.success) throw new AppError('Unable to read linked character', 502, 'UPSTREAM_ERROR', true);
  return parsed.data;
}
export async function getLinkedPlayer(actor: unknown) {
  return normalizeLinkedPlayer(await getDiscordPlayer(actor));
}
