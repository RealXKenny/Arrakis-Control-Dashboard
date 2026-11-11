import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSeasonFixture } from '../../helpers/seasons-redis.mjs';
import {
  seasonTemplate,
  definitionSchema,
  levelProgress,
  seasonState,
  periodFor,
  publicationProblems,
} from '../../../src/features/seasons/contracts';

const mock = vi.hoisted(() => ({ reply: null as ReturnType<typeof createSeasonFixture> }));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    command: async ([op, key, ...args]: (string | number)[]) =>
      mock.reply(String(op), String(key), args.map(String))?.value,
    eval: async (script: string, keys: string[], args: (string | number)[]) =>
      mock.reply('EVAL', script, [String(keys.length), ...keys, ...args.map(String)])?.value,
  }),
}));
import {
  saveSeason,
  transitionSeason,
  submitChallenge,
  reviewSubmission,
  claimReward,
  equipReward,
  correctXp,
  manageDelivery,
} from '../../../src/features/seasons/server/engine';
import { loadMember, readRecord, seasonKeys } from '../../../src/features/seasons/server/store';
import { savePresentation } from '../../../src/features/seasons/server/artwork';
import { seasonPresentation } from '../../../src/features/seasons/contracts';

beforeEach(() => {
  mock.reply = createSeasonFixture();
});
async function active(id = randomUUID()) {
  const definition = seasonTemplate();
  definition.startsAt = new Date(Date.now() - 3600000).toISOString();
  const draft = await saveSeason(id, '', definition, 'admin');
  return transitionSeason(id, draft.revision, 'publish', 'admin');
}
describe('season definitions and deterministic progression', () => {
  it('keeps each path independently completable and rejects unfair tracks', () => {
    const definition = seasonTemplate();
    expect(definitionSchema.safeParse(definition).success).toBe(true);
    expect(publicationProblems(definition)).toEqual([]);
    definition.challenges[0].xp = 1;
    expect(publicationProblems(definition)).toHaveLength(2);
    definition.thresholds = [0, 100, 90];
    expect(definitionSchema.safeParse(definition).success).toBe(false);
  });
  it('calculates exact thresholds and capped levels without changing XP', () => {
    const definition = seasonTemplate();
    expect(levelProgress(definition, 99).level).toBe(1);
    expect(levelProgress(definition, 100)).toMatchObject({ level: 2, fraction: 0 });
    expect(levelProgress(definition, 5000)).toMatchObject({ level: 5, fraction: 1, next: null });
  });
  it('derives scheduled and ended states at exact date boundaries across restarts', async () => {
    const season = await active();
    expect(seasonState(season, Date.parse(season.definition.startsAt) - 1)).toBe('scheduled');
    expect(seasonState(season, Date.parse(season.definition.startsAt))).toBe('active');
    expect(seasonState(season, Date.parse(season.definition.endsAt))).toBe('ended');
  });
  it('uses local calendar recurrence at DST and Monday boundaries', () => {
    const definition = seasonTemplate();
    definition.timezone = 'America/New_York';
    const challenge = { ...definition.challenges[0], cadence: 'daily' as const };
    expect(periodFor(challenge, definition, Date.parse('2026-11-01T03:59:00Z'))).toBe('2026-10-31');
    expect(periodFor(challenge, definition, Date.parse('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
    expect(periodFor({ ...challenge, cadence: 'weekly' }, definition, Date.parse('2026-11-02T12:00:00Z'))).toBe(
      '2026-11-02',
    );
  });
});
describe('atomic season operations through the store contract (fixture, not real Lua)', () => {
  it('versions live display edits without changing published rules or existing claims and freezes completed seasons', async () => {
    let season = await active();
    await claimReward(season.id, 'member', 'wayfarer');
    const frozen = structuredClone(season.definition);
    const presentation = { ...seasonPresentation(season), subtitle: 'A new community chapter' };
    const edited = await savePresentation(
      season.id,
      season.revision,
      presentation,
      'Correct the member-facing introduction.',
      'admin',
    );
    expect(edited.definition).toEqual(frozen);
    expect(edited.version).toBeGreaterThan(season.version);
    expect((await loadMember(season.id, 'member')).progress.value.claims[0].reward).toEqual(frozen.rewards[0]);
    expect(
      (
        await readRecord<{ before: unknown; after: unknown }>(
          seasonKeys.presentationSnapshot(season.id, edited.revision),
        )
      ).value.after,
    ).toEqual(presentation);
    await expect(
      savePresentation(season.id, season.revision, presentation, 'Stale changes must not overwrite.', 'admin'),
    ).rejects.toThrow('changed');
    await expect(
      savePresentation(
        season.id,
        edited.revision,
        { ...presentation, thresholds: [0, 1] } as typeof presentation,
        'Do not allow reward-rule edits.',
        'admin',
      ),
    ).rejects.toThrow();
    season = await transitionSeason(season.id, edited.revision, 'end', 'admin');
    await expect(
      savePresentation(season.id, season.revision, presentation, 'Cannot change completed history.', 'admin'),
    ).rejects.toThrow('Only scheduled');
  });
  it('freezes publication, rejects overlapping schedules and stale draft edits', async () => {
    const season = await active();
    await expect(saveSeason(season.id, season.revision, season.definition, 'admin')).rejects.toThrow('immutable');
    const next = { ...season.definition, number: 2, slug: 'second' };
    const draft = await saveSeason(randomUUID(), '', next, 'admin');
    await expect(transitionSeason(draft.id, draft.revision, 'publish', 'admin')).rejects.toThrow('overlap');
    await expect(saveSeason(draft.id, 'stale', next, 'admin')).rejects.toThrow('changed');
  });
  it('awards once under concurrent reviews and keeps user evidence private', async () => {
    const season = await active();
    const requestId = randomUUID();
    const result = await submitChallenge(season.id, 'member', 'solo-contribution', {
      text: 'An independently completed guide.',
      links: [],
      requestId,
    });
    const submission = result.progress.submissions[0];
    expect((await loadMember(season.id, 'other')).progress.value.submissions).toEqual([]);
    await expect(
      reviewSubmission(season.id, 'member', submission.id, true, 'Approved.', 'member'),
    ).rejects.toMatchObject({ statusCode: 403 });
    const results = await Promise.allSettled(
      [1, 2].map(() => reviewSubmission(season.id, 'member', submission.id, true, 'Approved.', 'admin')),
    );
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    const progress = (await loadMember(season.id, 'member')).progress.value;
    expect(progress.xp).toBe(700);
    expect(progress.ledger).toHaveLength(1);
    await reviewSubmission(season.id, 'member', submission.id, true, 'Approved twice.', 'admin');
    expect((await loadMember(season.id, 'member')).progress.value.xp).toBe(700);
    expect(
      (
        await submitChallenge(season.id, 'member', 'solo-contribution', {
          text: 'An independently completed guide.',
          links: [],
          requestId,
        })
      ).duplicate,
    ).toBe(true);
  });
  it('checks unlocks, claims once, and retains equipped cosmetics across independent seasons', async () => {
    let season = await active();
    await expect(claimReward(season.id, 'member', 'first-light')).rejects.toMatchObject({ statusCode: 403 });
    await expect(equipReward(season.id, 'other', 'wayfarer')).rejects.toMatchObject({ statusCode: 403 });
    await claimReward(season.id, 'member', 'wayfarer');
    expect((await claimReward(season.id, 'member', 'wayfarer')).duplicate).toBe(true);
    await equipReward(season.id, 'member', 'wayfarer');
    season = await transitionSeason(season.id, season.revision, 'end', 'admin');
    season = await transitionSeason(season.id, season.revision, 'archive', 'admin');
    const definition = { ...season.definition, number: 2, slug: 'season-two' };
    const next = await saveSeason(randomUUID(), '', definition, 'admin');
    await transitionSeason(next.id, next.revision, 'publish', 'admin');
    expect((await loadMember(next.id, 'member')).progress.value.xp).toBe(0);
    expect((await loadMember(season.id, 'member')).progress.value.claims).toHaveLength(1);
    expect((await readRecord<Record<string, unknown>>(seasonKeys.equipment('member'))).value).toHaveProperty('title');
  });
  it('appends idempotent corrections and refuses negative balances', async () => {
    const season = await active();
    const operationId = randomUUID();
    await correctXp(season.id, 'member', 100, 'Verified correction reason.', operationId, 'admin');
    await correctXp(season.id, 'member', 100, 'Verified correction reason.', operationId, 'admin');
    await expect(
      correctXp(season.id, 'member', -101, 'Invalid correction reason.', randomUUID(), 'admin'),
    ).rejects.toThrow('range');
    const progress = (await loadMember(season.id, 'member')).progress.value;
    expect(progress.xp).toBe(100);
    expect(progress.ledger).toHaveLength(1);
  });
  it('requires pending reviews to finish before archive and never awards rejected evidence', async () => {
    let season = await active();
    const result = await submitChallenge(season.id, 'member', 'solo-contribution', {
      text: 'Evidence needing moderator review.',
      links: [],
    });
    season = await transitionSeason(season.id, season.revision, 'end', 'admin');
    await expect(transitionSeason(season.id, season.revision, 'archive', 'admin')).rejects.toThrow('pending');
    await reviewSubmission(
      season.id,
      'member',
      result.progress.submissions[0].id,
      false,
      'Insufficient evidence.',
      'admin',
    );
    expect((await loadMember(season.id, 'member')).progress.value.xp).toBe(0);
    await transitionSeason(season.id, season.revision, 'archive', 'admin');
  });
  it('records level distribution and milestone unlocks in the same award transaction', async () => {
    const definition = seasonTemplate();
    definition.startsAt = new Date(Date.now() - 1000).toISOString();
    definition.milestones[0].target = 1;
    const draft = await saveSeason(randomUUID(), '', definition, 'admin');
    const season = await transitionSeason(draft.id, draft.revision, 'publish', 'admin');
    const submitted = await submitChallenge(season.id, 'member', 'solo-contribution', {
      text: 'A complete test field guide.',
      links: [],
    });
    await reviewSubmission(season.id, 'member', submitted.progress.submissions[0].id, true, 'Verified guide.', 'admin');
    const data = await loadMember(season.id, 'member');
    expect(data.totals.value.levels).toEqual({ '1': 0, '5': 1 });
    expect(data.totals.value.challenges).toEqual({ 'solo-contribution': 1 });
    expect(data.totals.value.milestones).toHaveProperty('shared-horizon');
  });
  it('requires separate delivery review without granting or executing game rewards', async () => {
    const season = await active();
    const proposals = await manageDelivery(
      season.id,
      { owner: 'member', description: 'Proposed recognition requiring integration approval.' },
      'admin',
    );
    await expect(
      manageDelivery(season.id, { deliveryId: proposals[0].id, approve: true, note: 'Approve proposal.' }, 'admin'),
    ).rejects.toMatchObject({ statusCode: 403 });
    const reviewed = await manageDelivery(
      season.id,
      { deliveryId: proposals[0].id, approve: true, note: 'Review only, execution disabled.' },
      'second-admin',
    );
    expect(reviewed[0].status).toBe('approved');
    expect((await loadMember(season.id, 'member')).progress.value.xp).toBe(0);
    expect((await loadMember(season.id, 'member')).progress.value.claims).toEqual([]);
  });
});
