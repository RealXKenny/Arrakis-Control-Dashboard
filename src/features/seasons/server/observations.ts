import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { getDuneClient } from '../../../server/integrations/dune';
import { spendReadBudget } from '../../../server/read-budget';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { record } from '../../../lib/value';
import { getLinkedPlayer } from '../../player/server/linked-player';
import type { DashboardSession } from '../../auth/server/session-store';
import { seasonState, type Challenge } from '../contracts';
import { fail, loadSeason, loadMember } from './store';
import { submitChallenge, syncAutomaticProgress } from './engine';
import { AppError } from '../../../lib/errors';

function canonicalId(value: unknown): string | null {
  const text =
    typeof value === 'string' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^[1-9][0-9]{0,19}$/.test(text) ? text : null;
}
type Character = { pawn: string; controller: string };
function character(link: Awaited<ReturnType<typeof getLinkedPlayer>>): Character {
  const pawn = canonicalId(link.pawnId),
    controller = canonicalId(link.controllerId);
  if (!link.linked || !pawn || !controller) fail('A verified linked character is required.', 403);
  return { pawn, controller };
}
/** Accept only the verified Console contract, never display names, client evidence or loosely truthy flags. */
export function observeObjective(raw: unknown, challenge: Challenge, expected: Character): string {
  if (Buffer.byteLength(JSON.stringify(raw) ?? '', 'utf8') > 2 * 1024 * 1024)
    fail('Objective response exceeds the safe limit.', 502);
  const source = record(raw),
    player = record(source.player),
    capabilities = record(source.capabilities);
  if (
    source.ok === false ||
    source.supported === false ||
    source.found === false ||
    canonicalId(player.actorId) !== expected.pawn ||
    canonicalId(player.controllerId) !== expected.controller
  )
    fail('Objective source did not confirm the linked character.', 502);
  if (challenge.verification === 'character-level') {
    if (
      capabilities.progression !== true ||
      typeof source.level !== 'number' ||
      !Number.isSafeInteger(source.level) ||
      source.level < 1 ||
      source.level > 1000
    )
      fail('Character level is unavailable from this Console.', 502);
    if (!challenge.minimumLevel || source.level < challenge.minimumLevel)
      fail('The required character level has not been reached.', 409);
    return `Console observation: character level ${source.level}; required ${challenge.minimumLevel}.`;
  }
  if (challenge.verification !== 'journey-node' || capabilities.journey !== true || !challenge.journeyNode)
    fail('Journey verification is unavailable from this Console.', 502);
  const groups = record(source.rows);
  const rows: unknown[] = [];
  for (const key of ['story', 'contract', 'codex', 'tutorial']) {
    if (!Array.isArray(groups[key]) || groups[key].length > 5000) fail('Journey data is incomplete or oversized.', 502);
    rows.push(...groups[key]);
  }
  if (rows.length > 5000) fail('Journey data exceeds the safe limit.', 502);
  const matches = rows.map(record).filter((row) => row.id === challenge.journeyNode);
  if (matches.length !== 1 || matches[0].complete !== true)
    fail('The required journey objective is not confirmed complete.', 409);
  return `Console observation: journey node ${challenge.journeyNode} complete.`;
}

export async function verifyObjective(
  session: DashboardSession,
  seasonId: string,
  challengeId: string,
  callerSignal: AbortSignal,
) {
  const season = (await loadSeason(seasonId)).value;
  if (seasonState(season) !== 'active') fail('This season is not active.');
  const challenge = season.definition.challenges.find((c) => c.id === challengeId);
  if (!challenge || challenge.verification === 'review') fail('This objective requires moderator review.', 400);
  const limit = await checkRateLimit(`v2:seasons:observe:${session.user.id}`, { limit: 6, windowMs: 60000 });
  if (!limit.allowed || limit.storageUnavailable)
    fail('Objective verification is temporarily limited.', limit.storageUnavailable ? 503 : 429);
  if (!(await spendReadBudget()).allowed) fail('Objective read capacity reached.', 429);
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(12000)]);
  const actor = {
    guildId: session.guildId,
    channelId: 'dashboard',
    userId: session.user.id,
    username: session.user.username,
    roleIds: session.roleIds,
    interactionId: `season-verify-${randomUUID()}`,
    commandName: 'portal',
  };
  signal.throwIfAborted();
  const before = character(await getLinkedPlayer(actor, { timeout: 4000 }));
  signal.throwIfAborted();
  let text = 'Fresh adapter observation: linked character confirmed.';
  if (challenge.verification !== 'linked-character') {
    const endpoint = challenge.verification === 'character-level' ? 'progression' : 'journey';
    const raw = await getDuneClient().request('GET', `/api/players/${before.pawn}/${endpoint}`, {
      timeoutMs: 4000,
      retryRead: false,
      signal,
    });
    text = observeObjective(raw, challenge, before);
  }
  const after = character(await getLinkedPlayer(actor, { timeout: 4000 }));
  signal.throwIfAborted();
  if (after.pawn !== before.pawn || after.controller !== before.controller)
    fail('Linked character changed. Refresh before verifying.', 409);
  return submitChallenge(seasonId, session.user.id, challengeId, { text, links: [] }, true);
}

export async function syncSeasonObjectives(session: DashboardSession, seasonId: string, callerSignal: AbortSignal) {
  const member = await loadMember(seasonId, session.user.id),
    season = member.season.value;
  if (!season.automatic || seasonState(season) !== 'active')
    fail('Automatic progression is unavailable for this season.');
  if (
    season.definition.challenges.every((c) =>
      member.progress.value.submissions.some((s) => s.challengeId === c.id && s.status === 'approved'),
    ) &&
    season.definition.rewards.every((r) => member.progress.value.claims.some((c) => c.reward.id === r.id))
  )
    return { progress: member.progress.value, duplicate: true };
  const limit = await checkRateLimit(`v2:seasons:observe:${session.user.id}`, { limit: 6, windowMs: 60000 });
  if (!limit.allowed || limit.storageUnavailable)
    fail('Objective verification is temporarily limited.', limit.storageUnavailable ? 503 : 429);
  if (!(await spendReadBudget()).allowed) fail('Objective read capacity reached.', 429);
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(12000)]);
  const actor = {
    guildId: session.guildId,
    channelId: 'dashboard',
    userId: session.user.id,
    username: session.user.username,
    roleIds: session.roleIds,
    interactionId: `season-sync-${randomUUID()}`,
    commandName: 'portal',
  };
  const before = character(await getLinkedPlayer(actor, { timeout: 4000 }));
  signal.throwIfAborted();
  const snapshots = new Map<string, unknown>();
  for (const verification of ['character-level', 'journey-node'] as const) {
    if (!season.definition.challenges.some((c) => c.verification === verification)) continue;
    snapshots.set(
      verification,
      await getDuneClient().request(
        'GET',
        `/api/players/${before.pawn}/${verification === 'character-level' ? 'progression' : 'journey'}`,
        { timeoutMs: 4000, retryRead: false, signal },
      ),
    );
  }
  const proofs = new Map<string, string>();
  const checked = new Map<string, string | null>();
  for (const challenge of season.definition.challenges) {
    if (challenge.verification === 'review') fail('Automatic seasons cannot approve submitted evidence.');
    if (challenge.verification === 'linked-character') {
      proofs.set(challenge.id, 'Fresh adapter observation: linked character confirmed.');
      continue;
    }
    const requirement = JSON.stringify([challenge.verification, challenge.minimumLevel, challenge.journeyNode]);
    if (checked.has(requirement)) {
      const text = checked.get(requirement);
      if (text) proofs.set(challenge.id, text);
      continue;
    }
    try {
      const text = observeObjective(snapshots.get(challenge.verification), challenge, before);
      proofs.set(challenge.id, text);
      checked.set(requirement, text);
    } catch (error) {
      if (!(error instanceof AppError) || error.statusCode !== 409) throw error;
      checked.set(requirement, null);
    }
  }
  const after = character(await getLinkedPlayer(actor, { timeout: 4000 }));
  signal.throwIfAborted();
  if (after.pawn !== before.pawn || after.controller !== before.controller)
    fail('Linked character changed. Refresh before verifying.');
  return syncAutomaticProgress(seasonId, session.user.id, proofs);
}
