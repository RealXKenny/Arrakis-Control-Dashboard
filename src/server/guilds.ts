import '../lib/assert-server';
import { getDuneClient } from '../infrastructure/dune';
import { findGuildDetails, reportedGuild, type GuildDetails } from '../features/guilds/details';
import { memberRows, toMemberView, type GuildMemberView } from '../features/guilds/members';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { getRedisClient } from '../lib/redis/client';
import type { DashboardSession } from '../lib/security/session-store';
import type { GuildApplicationSummary } from '../modules/guilds/applications';
import type { GuildRequirement, GuildRequirementListing } from '../modules/guilds/requirements';
import { readApplicationSummaries } from '../modules/guilds/server/application-status';
import { isGuildLeader } from '../modules/guilds/server/leader';
import { listRecruitingGuilds, readGuildRequirement } from '../modules/guilds/server/requirements';
import { spendReadBudget } from './read-budget';

export type GuildDirectoryResult =
  | {
      status: 'ok';
      page: number;
      hasMore: boolean;
      rows: GuildRequirementListing[];
      applications: Record<string, GuildApplicationSummary | null>;
    }
  | { status: 'limited'; retryAfter: number }
  | { status: 'unavailable'; message: string };

/** Recruitment directory: published listings plus this member's own application status for each. */
export async function loadGuildDirectory(session: DashboardSession, page: number): Promise<GuildDirectoryResult> {
  const budget = await spendReadBudget();
  if (!budget.allowed) return { status: 'limited', retryAfter: budget.retryAfter };

  try {
    const redis = getRedisClient();
    if (!redis) return { status: 'unavailable', message: 'Guild listings are unavailable right now.' };
    const { rows, hasMore } = await listRecruitingGuilds(redis, page);
    const applications = rows.length
      ? await readApplicationSummaries(
          redis,
          session.user.id,
          rows.map((row) => row.guildId),
        )
      : {};
    return { status: 'ok', page, hasMore, rows, applications };
  } catch (error) {
    if (error instanceof AppError && error.expose) return { status: 'unavailable', message: error.message };
    logger.error('Unable to load guild directory', error);
    return { status: 'unavailable', message: 'Guild listings are unreachable right now. Try again shortly.' };
  }
}

export type MyGuildResult =
  | {
      status: 'ok';
      guild: GuildDetails;
      members: GuildMemberView[];
      self: GuildMemberView | null;
      /** True only when the server verified the linked character holds the leader rank. */
      canEdit: boolean;
      /** False when leader verification could not run, so controls are hidden rather than guessed. */
      leaderCheck: boolean;
      /** Saved recruitment settings; only read once leadership is verified. */
      requirement: GuildRequirement | null;
    }
  | { status: 'none' }
  | { status: 'limited'; retryAfter: number }
  | { status: 'unavailable'; message: string };

function sameCharacter(member: GuildMemberView, row: Record<string, unknown>, character: Record<string, unknown>) {
  const playerId = character.playerId;
  const memberIds = [row.player_id, row.playerId, row.pawnId, row.pawn_id, row.controllerId, row.controller_id];
  if (playerId != null && memberIds.some((id) => id != null && String(id) === String(playerId))) return true;
  const name = typeof character.name === 'string' ? character.name.trim().toLowerCase() : '';
  return Boolean(name) && member.name.toLowerCase() === name;
}

/**
 * The signed-in player's guild. Leadership comes from the Console roster matched against the
 * server-verified linked character (`isGuildLeader`), never from anything the browser sends.
 */
export async function loadMyGuild(session: DashboardSession, character: unknown): Promise<MyGuildResult> {
  const reported = reportedGuild(character);
  if (!reported) return { status: 'none' };

  const budget = await spendReadBudget();
  if (!budget.allowed) return { status: 'limited', retryAfter: budget.retryAfter };

  try {
    const client = getDuneClient();
    const [guilds, roster] = await Promise.all([
      client.request('GET', '/api/guilds?page=0&pageSize=100'),
      client.request('GET', `/api/guilds/${encodeURIComponent(reported.id)}/members`),
    ]);
    const details = findGuildDetails(memberRows(guilds), reported) ?? {
      id: reported.id,
      name: reported.name || 'Your guild',
      faction: 'Not reported',
      description: '',
      memberCount: null,
    };
    const rows = memberRows(roster);
    const members = rows.map(toMemberView);

    let canEdit = false;
    let leaderCheck = true;
    try {
      canEdit = await isGuildLeader(session, reported.id, roster);
    } catch {
      // The roster stays readable; leader controls stay hidden until verification works again.
      leaderCheck = false;
    }

    const ownCharacter = character && typeof character === 'object' ? (character as Record<string, unknown>) : {};
    const selfIndex = members.findIndex((member, index) => sameCharacter(member, rows[index], ownCharacter));
    const redis = canEdit ? getRedisClient() : null;
    const requirement = redis ? await readGuildRequirement(redis, reported.id) : null;
    return {
      status: 'ok',
      guild: details,
      members,
      self: members[selfIndex] ?? null,
      canEdit,
      leaderCheck,
      requirement,
    };
  } catch (error) {
    if (error instanceof AppError && error.expose) return { status: 'unavailable', message: error.message };
    logger.error('Unable to load guild', error);
    return { status: 'unavailable', message: 'Guild data is unreachable right now. Try again shortly.' };
  }
}
