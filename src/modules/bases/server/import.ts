import '../../../lib/assert-server';
import { getLinkedPlayer } from '../../player/server/linked-player';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { NextResponse, getRequestOrigin } from '../../../infrastructure/pages-api';
import { cookies } from '../../../infrastructure/cookies';
import { getSession } from '../../../lib/session-store';
import { warmupDuneClient } from '../../../infrastructure/dune';
import { AppError } from '../../../lib/errors';
import { parseBlueprint } from '../schema';
import { reserveImport, finishImport } from './history';
import { record as objectRecord } from '../../portal/utils/inventory';
import type { ImportRecord } from '../types';

async function user(req: NextApiRequest, res: NextApiResponse) {
  const cookie = cookies(req, res).get('dashboard_session')?.value;
  const session = cookie ? await getSession(cookie) : null;
  if (!session || session.expiresAt <= Date.now())
    throw new AppError('Sign in to use Solido.', 401, 'UNAUTHORIZED', true);
  return session;
}
export async function POST(req: NextApiRequest, res: NextApiResponse) {
  if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin !== getRequestOrigin(req))
    throw new AppError('Invalid request origin.', 403, 'INVALID_ORIGIN', true);
  const session = await user(req, res);
  const body = z
    .object({
      requestId: z.string().uuid(),
      title: z.string().trim().min(1).max(80),
      blueprint: z.unknown().optional(),
    })
    .safeParse(req.body);
  if (!body.success)
    throw new AppError('Choose a blueprint and preview it before importing.', 400, 'INVALID_IMPORT', true);
  let blueprint;
  try {
    blueprint = parseBlueprint(body.data.blueprint);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(error instanceof Error ? error.message : 'Invalid blueprint.', 400, 'INVALID_BLUEPRINT', true);
  }
  const player = await getLinkedPlayer({
    guildId: session.guildId,
    channelId: 'dashboard',
    userId: session.user.id,
    username: session.user.username,
    roleIds: session.roleIds,
    interactionId: `solido-${body.data.requestId}`,
    commandName: 'portal',
  });
  const pawn = String(player?.pawnId ?? '');
  if (!player?.linked || !/^\d+$/.test(pawn) || !Number.isSafeInteger(Number(pawn)) || Number(pawn) < 1)
    throw new AppError('Your linked character could not be verified.', 403, 'PLAYER_UNAVAILABLE', true);
  const client = await warmupDuneClient();
  const record: ImportRecord = {
    id: body.data.requestId,
    title: body.data.title,
    at: new Date().toISOString(),
    status: 'pending',
    message: 'Import submitted. Check your backpack before attempting another import.',
  };
  const existing = await reserveImport(session.user.id, record);
  if (existing) return NextResponse.json({ ok: true, record: existing });
  const form = new FormData();
  form.set('player_id', pawn);
  form.set(
    'file',
    new Blob([JSON.stringify({ ...blueprint, name: record.title })], { type: 'application/json' }),
    'blueprint.json',
  );
  try {
    // No automatic resubmission: Console has no idempotency key for game writes.
    const result = await client.requestMultipart('POST', '/api/blueprints/import', form, false);
    if (objectRecord(result)?.ok !== true) throw new Error('Import not confirmed');
    record.status = 'imported';
    record.message = objectRecord(result).online
      ? 'Delivered to your backpack. Relog to see the Solido tool.'
      : 'Delivered to your backpack as a Solido tool.';
  } catch {
    record.status = 'unconfirmed';
    record.message =
      'Delivery could not be confirmed. Check your backpack and Console import audit before importing again.';
  }
  await finishImport(session.user.id, record);
  return NextResponse.json({ ok: true, record });
}
