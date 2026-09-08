import './common';
import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { getDuneClient } from '../../../infrastructure/dune';
import { NextResponse } from '../../../infrastructure/pages-api';
import { requireGuildSession, queryValue } from './common';

export async function GET(req, res) {
  const unauthorized = await requireGuildSession(req, res);
  if (unauthorized) return unauthorized;

  try {
    const rawGuildId = queryValue(req.query?.guildId);
    const guildId = rawGuildId || new URL(req.url, 'http://localhost').pathname.split('/')[3];
    if (!guildId || !/^[a-zA-Z0-9_-]{1,128}$/.test(guildId))
      throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
    const data = await getDuneClient().request('GET', `/api/guilds/${encodeURIComponent(guildId)}/members`);
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Unable to load guild members', error);
    return NextResponse.json({ ok: false, error: 'Unable to load guild members' }, { status: 502 });
  }
}
