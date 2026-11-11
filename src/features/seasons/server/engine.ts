import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import {
  definitionSchema,
  seasonState,
  levelProgress,
  publicationProblems,
  periodFor,
  type Definition,
  type Season,
  type Submission,
  type Progress,
  type Delivery,
  type Totals,
} from '../contracts';
import { commit, loadMember, loadSeason, readRecord, seasonKeys, fail, storage } from './store';

/** Review is useful before enabling an integration; approval alone can never execute a game write. */
export async function manageDelivery(
  id: string,
  input: { owner: string; description: string } | { deliveryId: string; approve: boolean; note: string },
  actor: string,
) {
  const season = await loadSeason(id);
  if (['draft', 'preview'].includes(season.value.phase)) fail('Publish the season before requesting delivery review.');
  const record = await readRecord<Delivery[]>(seasonKeys.deliveries(id));
  const deliveries = record.value ?? [];
  if ('owner' in input) {
    if (deliveries.length >= 100) fail('At most 100 delivery reviews per season.');
    deliveries.push({
      id: randomUUID(),
      ...input,
      requestedBy: actor,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    });
  } else {
    const delivery = deliveries.find((v) => v.id === input.deliveryId);
    if (!delivery) fail('Delivery request not found.', 404);
    if (delivery.status !== 'pending') return deliveries;
    if (delivery.requestedBy === actor) fail('A different administrator must review this delivery.', 403);
    delivery.status = input.approve ? 'approved' : 'rejected';
    delivery.reviewedBy = actor;
    delivery.reviewedAt = new Date().toISOString();
    delivery.note = input.note;
  }
  await commit({
    id,
    actor,
    action: 'delivery.reviewed',
    writes: [{ key: seasonKeys.deliveries(id), before: record.raw, after: deliveries }],
  });
  return deliveries;
}

export async function saveSeason(id: string, revision: string, input: Definition, actor: string) {
  const definition = definitionSchema.parse(input);
  const existing = await readRecord<Season>(seasonKeys.season(id));
  if (existing.value && existing.value.revision !== revision) fail('Season changed. Reload before saving.');
  if (!existing.value && revision) fail('Season no longer exists.', 404);
  if (existing.value && !['draft', 'preview'].includes(existing.value.phase))
    fail('Published definitions are immutable. Duplicate this season to make a new draft.');
  const season: Season = {
    id,
    revision: randomUUID(),
    phase: existing.value?.phase ?? 'draft',
    definition,
    createdAt: existing.value?.createdAt ?? new Date().toISOString(),
  };
  await commit({
    id,
    actor,
    action: 'season.saved',
    writes: [{ key: seasonKeys.season(id), before: existing.raw, after: season }],
    index: { id, score: Date.parse(season.createdAt) },
  });
  return season;
}
export async function transitionSeason(
  id: string,
  revision: string,
  action: 'preview' | 'publish' | 'end' | 'archive' | 'draft',
  actor: string,
) {
  const record = await loadSeason(id);
  const season = record.value;
  if (season.revision !== revision) fail('Season changed. Refresh first.');
  const now = Date.now();
  const state = seasonState(season, now);
  const allowed =
    action === 'preview'
      ? season.phase === 'draft'
      : action === 'draft'
        ? season.phase === 'preview'
        : action === 'publish'
          ? ['draft', 'preview'].includes(season.phase)
          : action === 'end'
            ? ['active', 'scheduled'].includes(state)
            : state === 'ended';
  if (!allowed) fail('This lifecycle transition is unavailable.');
  const writes: Parameters<typeof commit>[0]['writes'] = [];
  if (action === 'publish') {
    const problems = publicationProblems(season.definition);
    if (problems.length) fail(problems.join(' '), 400);
    if (Date.parse(season.definition.endsAt) <= now) fail('Choose a future season end.');
    // A shared CAS guard serializes publication, including different season IDs.
    const guard = await readRecord<string>(seasonKeys.scheduleRevision);
    for (const unique of [`slug:${season.definition.slug}`, `number:${season.definition.number}`]) {
      const key = seasonKeys.unique(unique);
      const record = await readRecord<string>(key);
      if (record.value) fail('Published season slug and number must be unique.');
      writes.push({ key, before: record.raw, after: id });
    }
    const windows = await storage().command(['ZRANGEBYSCORE', seasonKeys.schedules, now, '+inf', 'LIMIT', 0, 101]);
    if (!Array.isArray(windows) || windows.length >= 100) fail('Too many future seasons scheduled.');
    for (const otherId of windows) {
      const other = (await loadSeason(String(otherId))).value;
      if (other.phase !== 'published') continue;
      if (other.definition.slug === season.definition.slug || other.definition.number === season.definition.number)
        fail('Published season slug and number must be unique.');
      if (
        Date.parse(season.definition.startsAt) < Date.parse(other.definition.endsAt) &&
        Date.parse(season.definition.endsAt) > Date.parse(other.definition.startsAt)
      )
        fail('Published season schedules must not overlap.');
    }
    writes.push({ key: seasonKeys.scheduleRevision, before: guard.raw, after: randomUUID() });
    season.phase = 'published';
    season.publishedAt = new Date(now).toISOString();
  } else if (action === 'end') {
    season.phase = 'ended';
    season.endedAt = new Date(now).toISOString();
  } else season.phase = action === 'archive' ? 'archived' : action;
  season.revision = randomUUID();
  writes.unshift({ key: seasonKeys.season(id), before: record.raw, after: season });
  await commit({
    id,
    actor,
    action: `season.${action}`,
    writes,
    schedule: action === 'publish' ? { id, score: Date.parse(season.definition.endsAt) } : undefined,
    publish: action === 'publish' ? { id, score: now } : undefined,
    requireEmptyInbox: action === 'archive',
  });
  return season;
}

function ensureActive(season: Season) {
  if (seasonState(season) !== 'active') fail('This season is not active.');
}
function activeWindow(season: Season): [number, number] {
  return [Date.parse(season.definition.startsAt), Date.parse(season.definition.endsAt)];
}
function award(progress: Progress, xp: number, reason: string, actor: string, submissionId?: string) {
  if (progress.ledger.length >= 1250) fail('This member has reached the season ledger limit.');
  if (!Number.isSafeInteger(progress.xp + xp) || progress.xp + xp < 0 || progress.xp + xp > 100000000)
    fail('XP correction is outside the supported range.');
  progress.xp += xp;
  progress.ledger.push({ id: randomUUID(), delta: xp, reason, actor, at: new Date().toISOString(), submissionId });
}
function updateTotals(
  totals: Totals,
  season: Season,
  previousXp: number,
  progress: Progress,
  first: boolean,
  challengeId?: string,
  rewardId?: string,
) {
  const before = String(levelProgress(season.definition, previousXp).level);
  const after = String(levelProgress(season.definition, progress.xp).level);
  totals.levels ??= {};
  totals.challenges ??= {};
  totals.rewards ??= {};
  totals.milestones ??= {};
  if (first) totals.participants++;
  else if (before !== after) totals.levels[before] = Math.max(0, (totals.levels[before] ?? 1) - 1);
  if (first || before !== after) totals.levels[after] = (totals.levels[after] ?? 0) + 1;
  totals.xp += progress.xp - previousXp;
  if (challengeId) {
    totals.completions++;
    totals.challenges[challengeId] = (totals.challenges[challengeId] ?? 0) + 1;
  }
  if (rewardId) {
    totals.claims++;
    totals.rewards[rewardId] = (totals.rewards[rewardId] ?? 0) + 1;
  }
  for (const milestone of season.definition.milestones)
    if (totals.completions >= milestone.target && !totals.milestones[milestone.id])
      totals.milestones[milestone.id] = new Date().toISOString();
}

export async function submitChallenge(
  id: string,
  owner: string,
  challengeId: string,
  evidence: { text: string; links: string[]; requestId?: string },
  observed = false,
) {
  const data = await loadMember(id, owner);
  const season = data.season.value;
  if (evidence.requestId && data.progress.value.submissions.some((v) => v.id === evidence.requestId))
    return { progress: data.progress.value, duplicate: true };
  ensureActive(season);
  const challenge = season.definition.challenges.find((v) => v.id === challengeId);
  if (!challenge) fail('Challenge not found.', 404);
  if ((challenge.verification === 'linked-character') !== observed) fail('Use the configured challenge verification.');
  const period = periodFor(challenge, season.definition, Date.now());
  const progress = data.progress.value;
  const previousXp = progress.xp;
  const previous = progress.submissions.filter(
    (v) => v.challengeId === challengeId && v.period === period && v.status !== 'rejected',
  );
  if (previous.length >= challenge.limit) return { progress, duplicate: true };
  if (previous.some((v) => v.text === evidence.text && JSON.stringify(v.links) === JSON.stringify(evidence.links)))
    return { progress, duplicate: true };
  if (progress.submissions.length >= 1200) fail('This member has reached the season submission limit.');
  if (
    progress.submissions.filter((v) => v.status === 'rejected' && v.challengeId === challengeId && v.period === period)
      .length >= 2
  )
    fail('This challenge has reached its resubmission limit.');
  const submission: Submission = {
    id: evidence.requestId ?? randomUUID(),
    challengeId,
    owner,
    period,
    text: evidence.text,
    links: evidence.links,
    status: observed ? 'approved' : 'pending',
    submittedAt: new Date().toISOString(),
  };
  if (observed) {
    submission.reviewer = 'api:linked-character';
    submission.reviewedAt = submission.submittedAt;
    award(progress, challenge.xp, challenge.name, 'api:linked-character', submission.id);
  }
  const totals = data.totals.value;
  updateTotals(totals, season, previousXp, progress, !data.progress.raw, observed ? challengeId : undefined);
  progress.submissions.push(submission);
  await commit({
    id,
    actor: owner,
    action: observed ? 'challenge.observed' : 'challenge.submitted',
    active: activeWindow(season),
    writes: [
      { key: seasonKeys.season(id), before: data.season.raw },
      { key: seasonKeys.progress(id, owner), before: data.progress.raw, after: progress },
      { key: seasonKeys.totals(id), before: data.totals.raw, after: totals },
    ],
    inbox: observed ? undefined : { id: submission.id, value: JSON.stringify(submission), score: Date.now() },
    detail: { submissionId: submission.id, challengeId },
  });
  return { progress, duplicate: false };
}

export async function reviewSubmission(
  id: string,
  owner: string,
  submissionId: string,
  approve: boolean,
  note: string,
  actor: string,
) {
  const data = await loadMember(id, owner);
  if (data.season.value.phase === 'archived') fail('Archived seasons cannot accept moderation.');
  const progress = data.progress.value;
  const previousXp = progress.xp;
  const submission = progress.submissions.find((v) => v.id === submissionId);
  if (!submission) fail('Submission not found.', 404);
  if (submission.status !== 'pending') return { progress, duplicate: true };
  if (actor === owner) fail('Another administrator must review your submission.', 403);
  const challenge = data.season.value.definition.challenges.find((v) => v.id === submission.challengeId);
  if (!challenge) fail('Challenge not found.', 404);
  submission.status = approve ? 'approved' : 'rejected';
  submission.note = note;
  submission.reviewer = actor;
  submission.reviewedAt = new Date().toISOString();
  const totals = data.totals.value;
  if (approve) {
    award(progress, challenge.xp, challenge.name, actor, submission.id);
    updateTotals(totals, data.season.value, previousXp, progress, false, challenge.id);
  }
  await commit({
    id,
    actor,
    action: approve ? 'submission.approved' : 'submission.rejected',
    writes: [
      { key: seasonKeys.season(id), before: data.season.raw },
      { key: seasonKeys.progress(id, owner), before: data.progress.raw, after: progress },
      { key: seasonKeys.totals(id), before: data.totals.raw, after: totals },
    ],
    inbox: { id: submissionId, remove: true },
    detail: { submissionId, owner },
  });
  return { progress, duplicate: false };
}

export async function claimReward(id: string, owner: string, rewardId: string) {
  const data = await loadMember(id, owner);
  const state = seasonState(data.season.value);
  if (['draft', 'preview', 'scheduled'].includes(state)) fail('This reward track has not started.');
  const progress = data.progress.value;
  if (progress.claims.some((v) => v.reward.id === rewardId)) return { progress, duplicate: true };
  const reward = data.season.value.definition.rewards.find((v) => v.id === rewardId);
  if (!reward || levelProgress(data.season.value.definition, progress.xp).level < reward.level)
    fail('This reward is locked.', 403);
  progress.claims.push({ reward: structuredClone(reward), at: new Date().toISOString() });
  const totals = data.totals.value;
  updateTotals(totals, data.season.value, progress.xp, progress, !data.progress.raw, undefined, rewardId);
  await commit({
    id,
    actor: owner,
    action: 'reward.claimed',
    writes: [
      { key: seasonKeys.season(id), before: data.season.raw },
      { key: seasonKeys.progress(id, owner), before: data.progress.raw, after: progress },
      { key: seasonKeys.totals(id), before: data.totals.raw, after: totals },
    ],
    detail: { rewardId },
  });
  return { progress, duplicate: false };
}
export async function equipReward(id: string, owner: string, rewardId: string) {
  const data = await loadMember(id, owner);
  const claim = data.progress.value.claims.find((v) => v.reward.id === rewardId);
  if (!claim) fail('Claim this cosmetic before equipping it.', 403);
  const progress = data.progress.value;
  progress.equipped[claim.reward.kind] = rewardId;
  const equipment = await readRecord<Record<string, { reward: typeof claim.reward; seasonId: string }>>(
    seasonKeys.equipment(owner),
  );
  await commit({
    id,
    actor: owner,
    action: 'cosmetic.equipped',
    writes: [
      { key: seasonKeys.progress(id, owner), before: data.progress.raw, after: progress },
      {
        key: seasonKeys.equipment(owner),
        before: equipment.raw,
        after: { ...equipment.value, [claim.reward.kind]: { reward: claim.reward, seasonId: id } },
      },
    ],
  });
  return progress;
}
export async function correctXp(
  id: string,
  owner: string,
  delta: number,
  reason: string,
  operationId: string,
  actor: string,
) {
  const data = await loadMember(id, owner);
  if (['draft', 'preview', 'scheduled'].includes(seasonState(data.season.value))) fail('This season has not started.');
  const progress = data.progress.value;
  const previousXp = progress.xp;
  if (progress.ledger.some((v) => v.id === operationId)) return progress;
  award(progress, delta, `Correction: ${reason}`, actor);
  progress.ledger[progress.ledger.length - 1].id = operationId;
  const totals = data.totals.value;
  updateTotals(totals, data.season.value, previousXp, progress, !data.progress.raw);
  await commit({
    id,
    actor,
    action: 'xp.corrected',
    writes: [
      { key: seasonKeys.season(id), before: data.season.raw },
      { key: seasonKeys.progress(id, owner), before: data.progress.raw, after: progress },
      { key: seasonKeys.totals(id), before: data.totals.raw, after: totals },
    ],
    detail: { owner, delta, reason, operationId },
  });
  return progress;
}
