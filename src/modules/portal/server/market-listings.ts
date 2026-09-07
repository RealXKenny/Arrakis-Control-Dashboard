import { NextResponse } from '../../../infrastructure/pages-api';
import { cookies } from '../../../infrastructure/cookies';
import { getDuneClient } from '../../../infrastructure/dune';
import { getSession } from '../../../lib/session-store';
import { AppError } from '../../../lib/errors';

export async function GET(req, res) {
  const id = cookies(req, res).get('dashboard_session')?.value;
  const session = id ? await getSession(id) : null;
  if (!session || session.expiresAt <= Date.now())
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const query = new URL(req.url, 'http://localhost').searchParams;
  const templateId = query.get('templateId') ?? '';
  const quality = query.get('quality') ?? '';
  if (!/^[\w./:-]{1,200}$/.test(templateId) || (quality !== '' && !/^\d{1,2}$/.test(quality)))
    throw new AppError('Invalid item or grade', 400, 'INVALID_ITEM', true);
  const params = new URLSearchParams({ templateId });
  if (quality !== '') params.set('quality', quality);
  try {
    const data = await getDuneClient().request('GET', `/api/exchange/listings?${params}`);
    return NextResponse.json({ ok: true, ...data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    throw new AppError('Unable to load this price ladder', 502, 'UPSTREAM_ERROR', true);
  }
}
