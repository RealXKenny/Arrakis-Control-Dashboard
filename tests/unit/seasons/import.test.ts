import { readFile } from 'node:fs/promises';
import { beforeEach, expect, it, vi } from 'vitest';
import { createSeasonFixture } from '../../helpers/seasons-redis.mjs';
import { availableXp, paths, publicationProblems } from '../../../src/features/seasons/contracts';
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
import { saveSeason, transitionSeason } from '../../../src/features/seasons/server/engine';
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
  expect(paths.map((path) => availableXp(prepared.definition, path))).toEqual([5000, 5000, 5000, 5000, 5000]);
  expect(prepared.definition.thresholds.at(-1)).toBe(5000);
  expect(prepared.definition.rewards).toHaveLength(10);
  expect(
    prepared.definition.challenges.filter((challenge) => challenge.verification === 'linked-character'),
  ).toHaveLength(5);
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
