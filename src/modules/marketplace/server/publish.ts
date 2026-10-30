import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextResponse, isSameOriginRequest } from '../../../infrastructure/pages-api';
import { AppError } from '../../../lib/errors';
import { requireOwnedBaseExport } from '../../bases/server/owned-export';
import { record as objectRecord } from '../../portal/utils/inventory';
import { createMarketplaceRecord } from '../schema';
import { publishMarketplaceRecord } from './store';
import { getPreviewSettings } from '../../bases/server/preview-settings';

function displayText(value: unknown, fallback: string, maximum: number) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return (normalized || fallback).slice(0, maximum);
}

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  if (!isSameOriginRequest(req)) throw new AppError('Invalid request origin.', 403, 'INVALID_ORIGIN', true);
  const { blueprint, linkedPlayer, session } = await requireOwnedBaseExport(req, res);
  const baseId = String(req.query.baseId);
  const id = createHash('sha256').update(`${session.user.id}:${baseId}`).digest('hex').slice(0, 24);
  const preview = await getPreviewSettings(id);
  if (!preview?.image)
    throw new AppError('Choose a front and take a base picture before sharing.', 409, 'BASE_PICTURE_REQUIRED', true);
  const metadata = objectRecord(blueprint);
  const record = createMarketplaceRecord({
    id,
    title: displayText(metadata.name, 'Untitled base', 120),
    author: displayText(
      metadata.owner_name,
      displayText(
        linkedPlayer.characterName,
        displayText(session.user.global_name ?? session.user.username, 'Community member', 100),
        100,
      ),
      100,
    ),
    layout: blueprint,
    publishedAt: new Date().toISOString(),
  });
  await publishMarketplaceRecord(record);
  return NextResponse.json({ ok: true, listing: record.summary });
}
