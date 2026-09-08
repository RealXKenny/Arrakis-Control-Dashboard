import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { getRedisClient } from '../../../lib/redis';
import { getDuneClient } from '../../../infrastructure/dune';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { getGuildSession, queryValue } from './common';

const MAX_LOGO_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function logoKey(guildId: string) {
  return `arrakis:guild-logo:${guildId}`;
}

function guildIdFromRequest(req) {
  return queryValue(req.query?.guildId) || new URL(req.url, 'http://localhost').pathname.split('/')[3];
}

async function requireLeader(req, res, guildId: string) {
  const session = await getGuildSession(req, res);
  if (!session) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED', true);
  let playerId = session.linkedPlayerId;
  if (!playerId) {
    try {
      const player = await getLinkedPlayer({
        guildId: session.guildId,
        channelId: 'dashboard',
        userId: session.user.id,
        username: session.user.username,
        roleIds: session.roleIds,
        interactionId: `guild-logo-${guildId}`,
        commandName: 'portal',
      });
      playerId = String(player.pawnId ?? player.controllerId ?? '');
    } catch {
      throw new AppError(
        'Your linked character could not be verified right now. Refresh the dashboard and try again.',
        503,
        'PLAYER_VERIFICATION_UNAVAILABLE',
        true,
      );
    }
  }
  const playerName = String(session.linkedPlayerName ?? '')
    .trim()
    .toLowerCase();
  const response = await getDuneClient().request('GET', `/api/guilds/${encodeURIComponent(guildId)}/members`);
  const responseRecord = response && typeof response === 'object' ? (response as { rows?: unknown }) : null;
  const rows = Array.isArray(response) ? response : Array.isArray(responseRecord?.rows) ? responseRecord.rows : [];
  const member = rows.find((entry) => {
    const memberId = entry?.player_id ?? entry?.playerId ?? entry?.pawnId ?? entry?.pawn_id;
    const memberName = String(entry?.character_name ?? entry?.characterName ?? entry?.name ?? '')
      .trim()
      .toLowerCase();
    return String(memberId ?? '') === String(playerId) || (playerName && memberName === playerName);
  });
  if (!member || String(member.role_id ?? member.roleId) !== '100')
    throw new AppError('Only the guild leader can change the guild logo.', 403, 'GUILD_LEADER_REQUIRED', true);
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
    await requireLeader(req, res, guildId);
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
