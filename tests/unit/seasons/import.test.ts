import { readFile } from 'node:fs/promises';
import { beforeEach, expect, it, vi } from 'vitest';
import { createSeasonFixture } from '../../helpers/seasons-redis.mjs';
import { availableXp, paths, publicationProblems, levelProgress } from '../../../src/features/seasons/contracts';
const mock = vi.hoisted(() => ({ reply: null as ReturnType<typeof createSeasonFixture> }));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    command: async ([op, key, ...args]: (string | number)[]) =>
      mock.reply(String(op), String(key), args.map(String))?.value,
    eval: async (script: string, keys: string[], args: (string | number)[]) =>
      mock.reply('EVAL', script, [String(keys.length), ...keys, ...args.map(String)])?.value,
  }),
}));
import { importSeasonDraft, prepareSeasonImport } from '../../../src/features/seasons/server/import';
import {
  saveSeason,
  transitionSeason,
  submitChallenge,
  reviewSubmission,
  claimReward,
} from '../../../src/features/seasons/server/engine';
import { loadMember } from '../../../src/features/seasons/server/store';

beforeEach(() => {
  mock.reply = createSeasonFixture();
});

async function content(name = 'season-1.json') {
  const path = `src/features/seasons/content/${name}`;
  const raw = JSON.parse(await readFile(path, 'utf8')) as { artwork: { file: string; alt: string } };
  const { file, alt } = raw.artwork;
  return prepareSeasonImport({
    ...raw,
    artwork: { alt, data: await readFile(`src/features/seasons/content/${file}`) },
  });
}

it.each(['season-1.json', 'season-2-template.json'])('validates complete, fair reusable content: %s', async (name) => {
  const prepared = await content(name);
  expect(publicationProblems(prepared.definition)).toEqual([]);
  expect(paths.map((path) => availableXp(prepared.definition, path))).toEqual([50000, 50000, 50000, 50000, 50000]);
  expect(prepared.definition.thresholds).toHaveLength(100);
  expect(prepared.definition.thresholds.at(-1)).toBe(49500);
  expect(prepared.definition.rewards).toHaveLength(100);
  expect(prepared.definition.rewards.map((reward) => reward.level)).toEqual(
    Array.from({ length: 100 }, (_, i) => i + 1),
  );
  expect(prepared.definition.challenges).toHaveLength(100);
  for (const path of paths) {
    const quests = prepared.definition.challenges.filter((challenge) => challenge.path === path);
    expect(quests).toHaveLength(20);
    expect(
      levelProgress(
        prepared.definition,
        quests.reduce((sum, quest) => sum + quest.xp, 0),
      ).level,
    ).toBe(100);
  }
  expect(
    prepared.definition.challenges.every(
      (challenge) => challenge.verification === 'review' && challenge.cadence === 'seasonal' && challenge.limit === 1,
    ),
  ).toBe(true);
  expect(prepared.definition.artwork?.alt).toContain('golden sun');
  expect(prepared.definition.rewards.map((reward) => reward.gameReward?.type)).toContain('solaris');
  expect(prepared.definition.rewards.map((reward) => reward.gameReward?.type)).toContain('item');
});

it('imports an idempotent draft with artwork and keeps it editable and previewable', async () => {
  const prepared = await content();
  const imported = await importSeasonDraft(prepared, 'importer');
  expect(imported.created).toBe(true);
  expect(imported.season.phase).toBe('draft');
  expect((await importSeasonDraft(prepared, 'importer')).created).toBe(false);
  expect((await loadMember(imported.season.id, 'member')).progress.value.xp).toBe(0);
  const changed = await saveSeason(
    imported.season.id,
    imported.season.revision,
    { ...prepared.definition, subtitle: 'Edited through the validated admin operation.' },
    'admin',
  );
  const preview = await transitionSeason(changed.id, changed.revision, 'preview', 'admin');
  expect(preview.phase).toBe('preview');
  await expect(importSeasonDraft(prepared, 'importer')).rejects.toThrow('different content');
});

it('never overwrites an existing published season through an import rerun', async () => {
  const prepared = await content();
  const imported = await importSeasonDraft(prepared, 'importer');
  await transitionSeason(imported.season.id, imported.season.revision, 'publish', 'admin');
  await expect(importSeasonDraft(prepared, 'importer')).rejects.toThrow('must not be overwritten');
});

it('completes level 100 and claims all 100 rewards through in-game solo quest reviews without a guild', async () => {
  const prepared = await content();
  prepared.definition.startsAt = new Date(Date.now() - 3600000).toISOString();
  const imported = await importSeasonDraft(prepared, 'importer');
  const season = await transitionSeason(imported.season.id, imported.season.revision, 'publish', 'admin');
  await expect(claimReward(season.id, 'solo-member', prepared.definition.rewards[99].id)).rejects.toThrow();
  for (const quest of prepared.definition.challenges.filter((q) => q.path === 'solo')) {
    const submitted = await submitChallenge(season.id, 'solo-member', quest.id, {
      text: `Disposable reviewed gameplay evidence for ${quest.id}.`,
      links: [],
    });
    const submission = submitted.progress.submissions.at(-1)!;
    await reviewSubmission(
      season.id,
      'solo-member',
      submission.id,
      true,
      'Verified in-game completion for this objective.',
      'moderator',
    );
  }
  const progressed = await loadMember(season.id, 'solo-member');
  expect(progressed.progress.value.xp).toBe(50000);
  expect(levelProgress(prepared.definition, progressed.progress.value.xp).level).toBe(100);
  for (const reward of prepared.definition.rewards) await claimReward(season.id, 'solo-member', reward.id);
  const completed = await loadMember(season.id, 'solo-member');
  expect(completed.progress.value.claims).toHaveLength(100);
  expect(completed.totals.value.claims).toBe(100);
  await claimReward(season.id, 'solo-member', prepared.definition.rewards[99].id);
  expect((await loadMember(season.id, 'solo-member')).progress.value.claims).toHaveLength(100);
});
