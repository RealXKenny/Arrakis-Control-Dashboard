import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import content from '../../../src/features/seasons/content/season-2-template.json';
import {
  automaticLevelTemplate,
  currentWindow,
  generateSeason,
  seasonWindow,
  validateGeneratorTemplate,
} from '../../../src/features/seasons/generation';
import {
  definitionSchema,
  paths,
  publicationProblems,
  seasonState,
  seasonTemplate,
} from '../../../src/features/seasons/contracts';
import { createSeasonFixture } from '../../helpers/seasons-redis.mjs';
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
  configureGenerator,
  generatorStatus,
  runGenerator,
  setGeneratorEnabled,
} from '../../../src/features/seasons/server/generator';
import {
  claimReward,
  equipReward,
  saveSeason,
  syncAutomaticProgress,
  transitionSeason,
} from '../../../src/features/seasons/server/engine';
import {
  listSeasons,
  loadMember,
  loadSeason,
  readRecord,
  seasonKeys,
} from '../../../src/features/seasons/server/store';
const settings = { firstNumber: 1, firstStart: '2026-01-31T12:00:00.000Z', timezone: 'America/New_York' };
const base = () => automaticLevelTemplate(definitionSchema.parse(content.definition));
beforeEach(() => {
  mock.reply = createSeasonFixture();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(settings.firstStart);
});
afterEach(() => vi.useRealTimers());
describe('deterministic three-month generation', () => {
  it('uses anchor-based calendar months without month-end drift or local DST shifts', () => {
    expect(seasonWindow(settings.firstStart, 0)).toEqual({
      startsAt: settings.firstStart,
      endsAt: '2026-04-30T12:00:00.000Z',
    });
    expect(seasonWindow(settings.firstStart, 1).endsAt).toBe('2026-07-31T12:00:00.000Z');
    expect(seasonWindow('2027-11-30T02:30:00.000Z', 0).endsAt).toBe('2028-02-29T02:30:00.000Z');
    expect(currentWindow(settings.firstStart, Date.parse('2026-04-30T11:59:59Z'))).toBe(0);
    expect(currentWindow(settings.firstStart, Date.parse('2026-04-30T12:00:00Z'))).toBe(1);
  });
  it('generates 100 immutable cosmetic levels with deterministic curves and balanced API-only paths', () => {
    const source = base(),
      before = structuredClone(source),
      first = generateSeason(source, settings, 1, 0),
      second = generateSeason(source, settings, 2, 1);
    expect(first).toEqual(generateSeason(source, settings, 1, 0));
    expect(source).toEqual(before);
    expect([first.name, second.name]).toEqual(['Season 1', 'Season 2']);
    expect(first.thresholds).toHaveLength(100);
    expect(first.thresholds.at(-1)).toBe(49500);
    expect(first.rewards).toHaveLength(100);
    expect(first.rewards.every((r) => !r.gameReward && !r.artwork)).toBe(true);
    expect(first.rewards[0].name).not.toBe(second.rewards[0].name);
    expect(first.challenges).not.toEqual(second.challenges);
    for (const path of paths)
      expect(first.challenges.filter((c) => c.path === path).reduce((sum, c) => sum + c.xp, 0)).toBe(50000);
    expect(publicationProblems(first)).toEqual([]);
    expect(first.challenges.every((c) => c.verification !== 'review' && c.limit === 1)).toBe(true);
  });
  it('refuses to auto-approve moderated evidence or invent journey IDs', () => {
    expect(() => validateGeneratorTemplate(definitionSchema.parse(content.definition))).toThrow('API-observed');
    const template = base();
    template.challenges[0] = {
      ...template.challenges[0],
      verification: 'journey-node',
      minimumLevel: undefined,
      journeyNode: 'Verified.Existing.Node',
    };
    const generated = generateSeason(template, settings, 4, 3);
    expect(generated.challenges.find((c) => c.verification === 'journey-node')?.journeyNode).toBe(
      'Verified.Existing.Node',
    );
    expect(generated.challenges.filter((c) => c.verification === 'journey-node')).toHaveLength(1);
  });
});
describe('durable automatic lifecycle and ownership', () => {
  it('is disabled until authorized, then concurrently prepares only current and next seasons', async () => {
    expect((await runGenerator()).enabled).toBe(false);
    await configureGenerator('', settings, 'admin');
    await Promise.allSettled([runGenerator(), runGenerator()]);
    await runGenerator();
    const seasons = await listSeasons(0, true);
    expect(seasons).toHaveLength(2);
    expect(seasons.every((s) => s.phase === 'published' && s.automatic)).toBe(true);
    expect(seasons.map((s) => seasonState(s)).sort()).toEqual(['active', 'scheduled']);
    const before = structuredClone(seasons);
    await runGenerator();
    expect(await listSeasons(0, true)).toEqual(before);
    expect((await generatorStatus()).enabled).toBe(true);
  });
  it('automatically claims cosmetics once and archives Season 1 while Season 2 stays independent', async () => {
    await configureGenerator('', settings, 'admin');
    await runGenerator();
    const first = (await listSeasons(0, true)).find((s) => s.definition.number === 1)!;
    const proofs = new Map(first.definition.challenges.map((c) => [c.id, 'Verified disposable Console evidence.']));
    await Promise.allSettled([
      syncAutomaticProgress(first.id, 'member', proofs),
      syncAutomaticProgress(first.id, 'member', proofs),
    ]);
    const completed = (await loadMember(first.id, 'member')).progress.value;
    expect(completed).toMatchObject({ xp: 250000 });
    expect(completed.ledger).toHaveLength(100);
    expect(completed.claims).toHaveLength(100);
    expect((await syncAutomaticProgress(first.id, 'member', proofs)).duplicate).toBe(true);
    expect((await claimReward(first.id, 'member', 'level-1')).duplicate).toBe(true);
    await equipReward(first.id, 'member', 'level-1');
    vi.setSystemTime(first.definition.endsAt);
    await runGenerator();
    expect((await loadSeason(first.id)).value.phase).toBe('archived');
    expect((await loadMember(first.id, 'member')).progress.value.claims).toEqual(completed.claims);
    expect((await readRecord(seasonKeys.equipment('member'))).value).toBeTruthy();
    const second = (await listSeasons(0, true)).find((s) => s.definition.number === 2)!;
    expect(seasonState(second)).toBe('active');
    expect((await loadMember(second.id, 'member')).progress.value.xp).toBe(0);
    expect(await listSeasons(0, true)).toHaveLength(3);
  });
  it('fences an in-flight publisher when an administrator pauses automation', async () => {
    const policy = await configureGenerator('', settings, 'admin'),
      record = await readRecord(seasonKeys.generator);
    const definition = seasonTemplate();
    definition.startsAt = settings.firstStart;
    definition.endsAt = seasonWindow(settings.firstStart, 0).endsAt;
    const draft = await saveSeason(randomUUID(), '', definition, 'admin');
    await setGeneratorEnabled(policy.revision, false, 'admin');
    await expect(
      transitionSeason(draft.id, draft.revision, 'publish', 'system:season-generator', {
        key: seasonKeys.generator,
        before: record.raw,
      }),
    ).rejects.toThrow('changed');
    expect((await loadSeason(draft.id)).value.phase).toBe('draft');
    expect((await runGenerator()).enabled).toBe(false);
  });
  it('resumes safely after downtime without fabricating expired seasons or skipping season numbers', async () => {
    await configureGenerator('', settings, 'admin');
    vi.setSystemTime('2027-12-01T00:00:00Z');
    await runGenerator();
    const seasons = await listSeasons(0, true);
    expect(seasons.map((s) => s.definition.number).sort()).toEqual([1, 2]);
    expect(seasons.some((s) => seasonState(s) === 'active')).toBe(true);
    expect(seasons.every((s) => Date.parse(s.definition.endsAt) > Date.now())).toBe(true);
  });
  it('stops visibly on overlapping schedules without changing an existing season', async () => {
    const definition = seasonTemplate();
    definition.startsAt = settings.firstStart;
    definition.endsAt = seasonWindow(settings.firstStart, 0).endsAt;
    const draft = await saveSeason(randomUUID(), '', definition, 'admin'),
      published = await transitionSeason(draft.id, draft.revision, 'publish', 'admin');
    await configureGenerator('', { ...settings, firstNumber: 8 }, 'admin');
    const status = await runGenerator();
    expect(status.enabled).toBe(false);
    expect(status.error).toContain('overlap');
    expect((await loadSeason(published.id)).value).toEqual(published);
  });
});
