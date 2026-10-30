import '../../../lib/assert-server';
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextResponse } from '../../../infrastructure/pages-api';
import { cookies } from '../../../infrastructure/cookies';
import { AppError } from '../../../lib/errors';
import { getSession } from '../../../lib/session-store';
import { getMarketplaceRecord, listMarketplaceSummaries } from './store';
import { getPreviewSettings, previewId } from '../../bases/server/preview-settings';
import { ownedBaseContext } from '../../bases/server/owned-export';

async function requireMember(req: NextApiRequest, res: NextApiResponse) {
  const sessionId = cookies(req, res).get('dashboard_session')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session || session.expiresAt <= Date.now())
    throw new AppError('Sign in to browse the Base Marketplace.', 401, 'UNAUTHORIZED', true);
  return session;
}

export async function list(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireMember(req, res);
  const listings = await listMarketplaceSummaries();
  // Legacy listing IDs already bind the publisher and base; no republishing or name matching is needed.
  const ownership = await ownedBaseContext(session).catch(() => null);
  const editable = new Map((ownership?.ids ?? []).map((id) => [previewId(session.user.id, id), id]));
  return NextResponse.json({
    ok: true,
    listings: listings.map((listing) => ({
      ...listing,
      ...(editable.has(listing.id) ? { editableBaseId: editable.get(listing.id) } : {}),
    })),
    total: listings.length,
  });
}

export async function detail(req: NextApiRequest, res: NextApiResponse) {
  await requireMember(req, res);
  const id = req.query.listingId;
  if (typeof id !== 'string') throw new AppError('Marketplace listing not found.', 404, 'NOT_FOUND', true);
  const record = await getMarketplaceRecord(id);
  if (!record) throw new AppError('Marketplace listing not found.', 404, 'NOT_FOUND', true);
  if (req.query.image === '1') {
    const preview = await getPreviewSettings(id);
    if (!preview?.image) throw new AppError('Base picture not found.', 404, 'NOT_FOUND', true);
    const bytes = Buffer.from(preview.image.split(',')[1], 'base64');
    const response = new NextResponse(null, {
      headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff' },
    });
    response.stream = {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      maximumBytes: 1024 * 1024,
    };
    return response;
  }
  const download = req.query.download === '1';
  return new NextResponse(JSON.stringify(record, null, 2), {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
      ...(download
        ? {
            'Content-Disposition': `attachment; filename="${record.summary.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.json"`,
          }
        : {}),
    },
  });
}
