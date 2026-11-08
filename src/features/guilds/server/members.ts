import './common';
import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { getDuneClient } from '../../../server/integrations/dune';
import { NextResponse } from '../../../server/pages-api';
import { getGuildSession, queryValue } from './common';
import { isGuildLeader } from './leader';

export async function GET(req, res) {
  const session = await getGuildSession(req, res);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const rawGuildId = queryValue(req.query?.guildId);
    const guildId = rawGuildId || new URL(req.url, 'http://localhost').pathname.split('/')[3];
    if (!guildId || !/^[a-zA-Z0-9_-]{1,128}$/.test(guildId))
      throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
    const data = await getDuneClient().request('GET', `/api/guilds/${encodeURIComponent(guildId)}/members`);
    let canEdit = false;
    try {
      canEdit = await isGuildLeader(session, guildId, data);
    } catch {
      // Membership stays readable when the linked identity provider is temporarily unavailable.
    }
    return NextResponse.json({ ok: true, data, canEdit }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Unable to load guild members', error);
    return NextResponse.json({ ok: false, error: 'Unable to load guild members' }, { status: 502 });
  }
}
