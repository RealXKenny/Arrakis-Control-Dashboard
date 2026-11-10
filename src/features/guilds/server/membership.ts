import '../../../lib/assert-server';
import { guildKeys } from '../../../lib/redis/keys';
import { z } from 'zod';
import { AppError } from '../../../lib/errors';
import { getDuneClient } from '../../../server/integrations/dune';
import { DuneConsoleApiError } from '../../../server/integrations/dunedocker/transport';
import { NextResponse } from '../../../server/pages-api';
import { getRedisClient } from '../../../lib/redis/client';
import { requireGuildLeader } from './leader';
import { recordAudit } from '../../../lib/security/audit';
import { getGuildSession, queryValue, requireGuildMutationOrigin } from './common';
import { guildMemberId, guildMemberRole } from '../member-identity';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const addSchema = z.object({ playerId: id, roleId: z.number().int().min(1).max(99).default(1) });
const memberSchema = z.object({
  expectedRole: z.number().int().min(1).max(100),
  confirmation: z.string().max(32).optional(),
});
type Action = 'add' | 'remove' | 'promote' | 'demote' | 'disband';
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function removeGuildStorage(guildId: string) {
  const redis = getRedisClient();
  if (!redis) throw new Error('Storage unavailable');
  await redis.eval(
    `
    local apps = redis.call('HGETALL', KEYS[4])
    for i = 1, #apps, 2 do
      local valid, application = pcall(cjson.decode, apps[i + 1])
      if valid then
        local chatKey = ARGV[2] .. apps[i] .. ':' .. (application.conversationId or tostring(application.submittedAt))
        redis.call('DEL', chatKey, chatKey .. ':seen')
      end
    end
    for _, encoded in ipairs(redis.call('LRANGE', KEYS[6], -100, -1)) do
      local valid, message = pcall(cjson.decode, encoded)
      if valid and type(message) == 'table' and type(message.senderId) == 'string' and type(message.id) == 'string' then
        redis.call('ZREM', KEYS[7], ARGV[3] .. ':' .. message.senderId .. ':' .. message.id)
      end
    end
    redis.call('DEL', KEYS[1], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[6] .. ':seen', KEYS[8], KEYS[9], KEYS[10])
    redis.call('ZREM', KEYS[2], ARGV[1])
    return 1
  `,
    [
      guildKeys.requirements(guildId),
      guildKeys.requirementsIndex,
      guildKeys.logo(guildId),
      guildKeys.applications(guildId),
      guildKeys.applicationsIndex(guildId),
      guildKeys.support(guildId),
      guildKeys.supportUnread,
      guildKeys.noticeboard(guildId),
      guildKeys.operations(guildId),
      guildKeys.resourceRequests(guildId),
    ],
    [`guild:${guildId}`, guildKeys.chatPrefix(guildId), guildId],
  );
}

async function mutate(req, res, action: Action) {
  requireGuildMutationOrigin(req);
  const parsedGuild = id.safeParse(queryValue(req.query?.guildId));
  if (!parsedGuild.success) throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
  const guildId = parsedGuild.data;
  try {
    const roster = await requireGuildLeader(req, res, guildId);
    let playerId: string | undefined;
    let method: 'POST' | 'DELETE' = 'POST';
    let route = `/api/guilds/${encodeURIComponent(guildId)}`;
    let body: unknown;
    if (action === 'add') {
      const parsed = addSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError('Enter a valid player ID and a role from 1 to 99.', 400, 'INVALID_GUILD_MEMBER', true);
      playerId = parsed.data.playerId;
      body = parsed.data;
      route += '/members';
    } else if (action === 'disband') {
      if (req.body?.confirmation !== 'DISBAND GUILD')
        throw new AppError('Type DISBAND GUILD to confirm.', 400, 'GUILD_CONFIRMATION_REQUIRED', true);
      method = 'DELETE';
      body = { confirmation: 'DISBAND GUILD' };
    } else {
      const parsedPlayer = id.safeParse(queryValue(req.query?.playerId));
      const parsedBody = memberSchema.safeParse(req.body);
      if (!parsedPlayer.success || !parsedBody.success)
        throw new AppError('Invalid member change', 400, 'INVALID_GUILD_MEMBER', true);
      playerId = parsedPlayer.data;
      const data = record(roster);
      const rows: unknown[] = Array.isArray(roster)
        ? roster
        : Array.isArray(data.rows)
          ? data.rows
          : Array.isArray(data.data)
            ? data.data
            : [];
      const member = rows.map(record).find((value) => guildMemberId(value) === playerId);
      if (!member)
        throw new AppError(
          'This player is no longer in this guild. Refresh the member list.',
          409,
          'GUILD_MEMBER_CHANGED',
          true,
        );
      const role = guildMemberRole(member);
      if (role === null || role !== parsedBody.data.expectedRole)
        throw new AppError(
          'This member’s rank changed. Refresh the member list before trying again.',
          409,
          'GUILD_MEMBER_CHANGED',
          true,
        );
      if (role === 100) {
        if (action === 'promote')
          return NextResponse.json({
            ok: true,
            data: { action, guildId, playerId, alreadyLeader: true, relogRequired: false },
          });
        throw new AppError('The guild leader cannot be removed or demoted.', 409, 'GUILD_LEADER_PROTECTED', true);
      }
      if (action === 'demote' && role !== 50)
        throw new AppError('Only an Officer can be demoted to Member.', 409, 'INVALID_GUILD_RANK_CHANGE', true);
      if (action === 'promote' && ![1, 50].includes(role))
        throw new AppError('This rank cannot be promoted from the dashboard.', 409, 'INVALID_GUILD_RANK_CHANGE', true);
      if (action === 'promote' && role === 50 && parsedBody.data.confirmation !== 'TRANSFER LEADERSHIP')
        throw new AppError(
          'Confirm the leadership transfer before promoting this Officer.',
          400,
          'GUILD_CONFIRMATION_REQUIRED',
          true,
        );
      if (action === 'remove' && parsedBody.data.confirmation !== 'REMOVE MEMBER')
        throw new AppError('Confirm member removal.', 400, 'GUILD_CONFIRMATION_REQUIRED', true);
      route += `/members/${encodeURIComponent(playerId)}`;
      if (action === 'remove') method = 'DELETE';
      else route += `/${action}`;
    }
    // Dev note: leadership is not a retry loop; every write gets exactly one trip through the desert.
    await getDuneClient().request(method, route, { ...(body === undefined ? {} : { body }), retryRead: false });
    void recordAudit({
      event: `guild.${action}`,
      outcome: 'success',
      actor: (await getGuildSession(req, res))?.user.id,
      data: { guildId, ...(playerId ? { playerId } : {}) },
    });
    let cleanupPending = false;
    if (action === 'disband') {
      try {
        await removeGuildStorage(guildId);
      } catch {
        cleanupPending = true;
      }
    }
    return NextResponse.json({
      ok: true,
      data: {
        action,
        guildId,
        ...(playerId ? { playerId } : {}),
        relogRequired: action === 'promote' || action === 'demote',
        ...(cleanupPending
          ? { warning: 'Saved recruitment data could not be cleared. The guild has already been disbanded.' }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof DuneConsoleApiError && [400, 409].includes(error.status))
      throw new AppError(
        action === 'add'
          ? 'Console refused the invitation. Check the player is guildless, faction compatible, and the guild has room.'
          : 'Console refused this change. Refresh the guild and check the current member ranks.',
        409,
        'GUILD_CHANGE_REFUSED',
        true,
      );
    if (error instanceof DuneConsoleApiError && error.status === 403)
      throw new AppError(
        'The Console API key does not permit this guild operation.',
        403,
        'GUILD_CONSOLE_FORBIDDEN',
        true,
      );
    throw new AppError(
      'Unable to confirm the guild change. Refresh the guild before trying again.',
      502,
      'GUILD_CHANGE_UNAVAILABLE',
      true,
    );
  }
}
export const ADD = (req, res) => mutate(req, res, 'add');
export const REMOVE = (req, res) => mutate(req, res, 'remove');
export const PROMOTE = (req, res) => mutate(req, res, 'promote');
export const DEMOTE = (req, res) => mutate(req, res, 'demote');
export const DISBAND = (req, res) => mutate(req, res, 'disband');
