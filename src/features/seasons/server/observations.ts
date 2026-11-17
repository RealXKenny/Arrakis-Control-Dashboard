import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { getDuneClient } from '../../../server/integrations/dune';
import { spendReadBudget } from '../../../server/read-budget';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { getLinkedPlayer } from '../../player/server/linked-player';
import type { DashboardSession } from '../../auth/server/session-store';
import { assignmentSchema, seasonState, type Assignment } from '../contracts';
import { buildAssignment } from '../engine/assignment';
import { fail, loadMember, readRecord, seasonKeys, commit } from './store';
import { submitChallenge, syncAutomaticProgress, type Tracking } from './engine';
import { freshEvidence } from './fresh-progress';

function canonicalId(value: unknown): string | null {
  const text =
    typeof value === 'string' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^[1-9][0-9]{0,19}$/.test(text) ? text : null;
}
function character(link: Awaited<ReturnType<typeof getLinkedPlayer>>) {
  const pawn = canonicalId(link.pawnId),
    controller = canonicalId(link.controllerId);
  if (!link.linked || !pawn || !controller) fail('A verified linked character is required.', 403);
  return { pawn, controller };
}
async function readEvidence(
  session: DashboardSession,
  seasonId: string,
  callerSignal: AbortSignal,
  challengeId?: string,
) {
  const member = await loadMember(seasonId, session.user.id),
    season = member.season.value;
  if (seasonState(season) !== 'active') fail('This season is not active.');
  if (!challengeId && !season.automatic) fail('Automatic progression is unavailable for this season.');
  const target = challengeId ? season.definition.challenges.find((c) => c.id === challengeId) : null;
  if (challengeId && (!target || target.verification === 'review'))
    fail('This objective requires moderator review.', 400);
  if (target?.verification === 'linked-character')
    fail('Linking a character does not prove new in-game progress. Choose a gameplay objective.', 400);
  const baselineKey = seasonKeys.baseline(seasonId, session.user.id);
  // Read the CAS revision before provider reads: stale concurrent observations cannot roll back the high-water mark.
  const baseline = await readRecord(baselineKey);
  const assignmentKey = seasonKeys.assignment(seasonId, session.user.id);
  const stored = await readRecord<Assignment>(assignmentKey);
  if (stored.value && !assignmentSchema.safeParse(stored.value).success) fail('Season assignment is corrupt.', 500);
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
    interactionId: `season-observe-${randomUUID()}`,
    commandName: 'portal',
  };
  signal.throwIfAborted();
  const before = character(await getLinkedPlayer(actor, { timeout: 4000 }));
  signal.throwIfAborted();
  const challenges = season.definition.challenges.filter((c) => c.verification !== 'review');
  const snapshots = new Map<string, unknown>();
  for (const endpoint of ['progression', 'journey']) {
    const needed = challenges.some(
      (c) =>
        c.verification === 'season-progress' ||
        (endpoint === 'progression' ? c.verification === 'character-level' : c.verification === 'journey-node'),
    );
    if (needed)
      snapshots.set(
        endpoint,
        await getDuneClient().request('GET', `/api/players/${before.pawn}/${endpoint}`, {
          timeoutMs: 4000,
          retryRead: false,
          signal,
        }),
      );
  }
  let assignment = stored.value;
  let evidence = freshEvidence(challenges, before, snapshots, baseline.value, assignment);
  let createdAssignment: Assignment | null = null;
  if (!assignment && challenges.some((c) => c.personalized)) {
    // The plan derives only from the immutable enrollment baseline, so concurrent creators write identical bytes.
    createdAssignment = buildAssignment({
      definition: season.definition,
      seasonId,
      owner: session.user.id,
      baseline: {
        at: evidence.baseline.at,
        level: evidence.baseline.level ?? null,
        xp: evidence.baseline.xp ?? null,
        nodes: evidence.baseline.nodes,
      },
    });
    assignment = createdAssignment;
    if (!evidence.established) evidence = freshEvidence(challenges, before, snapshots, baseline.value, assignment);
  }
  const after = character(await getLinkedPlayer(actor, { timeout: 4000 }));
  signal.throwIfAborted();
  if (after.pawn !== before.pawn || after.controller !== before.controller)
    fail('Linked character changed. Refresh before verifying.');
  const writes: Tracking[] = [];
  if (JSON.stringify(evidence.baseline) !== baseline.raw)
    writes.push({ key: baselineKey, before: baseline.raw, after: evidence.baseline });
  if (createdAssignment) writes.push({ key: assignmentKey, before: stored.raw, after: createdAssignment });
  return { member, season, evidence, tracking: writes.length ? writes : undefined, assignment };
}
export async function verifyObjective(
  session: DashboardSession,
  seasonId: string,
  challengeId: string,
  signal: AbortSignal,
) {
  const { member, season, evidence, tracking, assignment } = await readEvidence(session, seasonId, signal, challengeId);
  const text = evidence.proofs.get(challengeId);
  if (!text) {
    if (tracking)
      await commit({
        id: seasonId,
        actor: session.user.id,
        action: evidence.established ? 'tracking.started' : 'tracking.observed',
        active: [Date.parse(season.definition.startsAt), Date.parse(season.definition.endsAt)],
        writes: [{ key: seasonKeys.season(seasonId), before: member.season.raw }, ...tracking],
      });
    return {
      progress: member.progress.value,
      totals: member.totals.value,
      duplicate: false,
      trackingOnly: true,
      trackingEstablished: evidence.established,
      tracking: evidence.summary,
      assignment,
    };
  }
  return {
    ...(await submitChallenge(seasonId, session.user.id, challengeId, { text, links: [] }, true, tracking)),
    tracking: evidence.summary,
    assignment,
  };
}
export async function syncSeasonObjectives(session: DashboardSession, seasonId: string, signal: AbortSignal) {
  const { evidence, tracking, assignment } = await readEvidence(session, seasonId, signal);
  return {
    ...(await syncAutomaticProgress(seasonId, session.user.id, evidence.proofs, tracking)),
    trackingEstablished: evidence.established,
    tracking: evidence.summary,
    assignment,
  };
}
