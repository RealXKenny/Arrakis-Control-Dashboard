import './common';
import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { getDuneClient } from '../../../infrastructure/dune';
import { NextResponse } from '../../../infrastructure/pages-api';
import { requireGuildSession, queryValue } from './common';

function validPage(value: string | undefined, fallback: string, max: number) {
  const result = value ?? fallback;
  if (!/^\d{1,6}$/.test(result) || Number(result) > max)
    throw new AppError('Invalid guild query', 400, 'INVALID_GUILD_QUERY', true);
  return result;
}

export async function GET(req, res) {
  const unauthorized = await requireGuildSession(req, res);
  if (unauthorized) return unauthorized;

  try {
    const query = req.query || new URL(req.url, 'http://localhost').searchParams;
    const get = (name: string) =>
      query instanceof URLSearchParams ? (query.get(name) ?? undefined) : queryValue(query[name]);
    const params = new URLSearchParams();
    const q = (get('q') ?? '').trim();
    if (q.length > 128) throw new AppError('Invalid guild query', 400, 'INVALID_GUILD_QUERY', true);
    if (q) params.set('q', q);
    params.set('page', validPage(get('page'), '0', 999999));
    params.set('pageSize', validPage(get('pageSize'), '100', 100));
    const sortColumn = get('sortColumn');
    const sortDirection = get('sortDirection');
    if (sortColumn && !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(sortColumn))
      throw new AppError('Invalid guild query', 400, 'INVALID_GUILD_QUERY', true);
    if (sortDirection && !['asc', 'desc'].includes(sortDirection.toLowerCase()))
      throw new AppError('Invalid guild query', 400, 'INVALID_GUILD_QUERY', true);
    if (sortColumn) params.set('sortColumn', sortColumn);
    if (sortDirection) params.set('sortDirection', sortDirection.toLowerCase());
    const data = await getDuneClient().request('GET', `/api/guilds?${params}`);
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Unable to load guilds', error);
    return NextResponse.json({ ok: false, error: 'Unable to load guilds' }, { status: 502 });
  }
}
