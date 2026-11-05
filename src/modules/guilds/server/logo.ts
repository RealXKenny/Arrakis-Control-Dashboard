import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { getRedisClient } from '../../../lib/redis/client';
import { NextResponse } from '../../../infrastructure/pages-api';
import { requireGuildLeader } from './leader';
import { getGuildSession, queryValue } from './common';

const MAX_LOGO_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function logoKey(guildId: string) {
  return `arrakis:guild-logo:${guildId}`;
}

function guildIdFromRequest(req) {
  return queryValue(req.query?.guildId) || new URL(req.url, 'http://localhost').pathname.split('/')[3];
}

export async function GET(req, res) {
  const session = await getGuildSession(req, res);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const guildId = guildIdFromRequest(req);
  if (!guildId || !/^[a-zA-Z0-9_-]{1,128}$/.test(guildId))
    throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
  const redis = getRedisClient();
  if (!redis) throw new AppError('Guild logo storage is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  const logo = await redis.get<string>(logoKey(guildId));
  return NextResponse.json({ ok: true, data: { logo: logo ?? null } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req, res) {
  try {
    const guildId = guildIdFromRequest(req);
    if (!guildId || !/^[a-zA-Z0-9_-]{1,128}$/.test(guildId))
      throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
    await requireGuildLeader(req, res, guildId);
    const value = req.body?.logo;
    if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value))
      throw new AppError('Upload a valid PNG logo.', 400, 'INVALID_GUILD_LOGO', true);
    const encoded = value.slice('data:image/png;base64,'.length);
    const bytes = Buffer.from(encoded, 'base64');
    if (
      bytes.length === 0 ||
      bytes.length > MAX_LOGO_BYTES ||
      !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    )
      throw new AppError('PNG logos must be no larger than 512 KiB.', 400, 'INVALID_GUILD_LOGO', true);
    const redis = getRedisClient();
    if (!redis) throw new AppError('Guild logo storage is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
    await redis.set(logoKey(guildId), value);
    return NextResponse.json({ ok: true, data: { logo: value } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Unable to save guild logo', error);
    return NextResponse.json({ ok: false, error: 'Unable to save guild logo' }, { status: 502 });
  }
}
