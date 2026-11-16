import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { definitionSchema, identifier, publicationProblems, type Season } from '../contracts';
import { normalizeArtwork } from './artwork';
import { commit, fail, loadSeason, readRecord, seasonKeys } from './store';

const importSchema = z
  .object({
    id: identifier,
    definition: z.record(z.string(), z.unknown()),
    artwork: z
      .object({ data: z.instanceof(Uint8Array), alt: z.string().trim().min(1).max(200) })
      .strict()
      .optional(),
  })
  .strict();

export async function prepareSeasonImport(input: unknown) {
  const content = importSchema.parse(input);
  const artwork = content.artwork ? await normalizeArtwork(content.artwork.data) : undefined;
  const definition = definitionSchema.parse({
    ...content.definition,
    artwork: artwork && content.artwork ? { id: artwork.id, alt: content.artwork.alt } : undefined,
  });
  const problems = publicationProblems(definition);
  if (problems.length) fail(`Season content is not publishable: ${problems.join(' ')}`, 400);
  return { id: content.id, definition, artwork };
}

export type PreparedSeasonImport = Awaited<ReturnType<typeof prepareSeasonImport>>;

export async function importSeasonDraft(prepared: PreparedSeasonImport, actor: string) {
  const existing = await readRecord<Season>(seasonKeys.season(prepared.id));
  if (existing.value) {
    const season = (await loadSeason(prepared.id)).value;
    if (!['draft', 'preview'].includes(season.phase))
      fail('An existing published season must not be overwritten.', 409);
    if (JSON.stringify(season.definition) !== JSON.stringify(prepared.definition))
      fail('This import ID already contains different content. Edit the draft through the admin dashboard.', 409);
    return { season, created: false };
  }
  const now = new Date().toISOString();
  const season: Season = {
    id: prepared.id,
    revision: randomUUID(),
    phase: 'draft',
    definition: prepared.definition,
    createdAt: now,
    version: 1,
  };
  const artworkRecord = prepared.artwork ? await readRecord(seasonKeys.artwork(prepared.artwork.id)) : undefined;
  const artworkIndex = prepared.artwork ? await readRecord<string[]>(seasonKeys.artworkIndex(prepared.id)) : undefined;
  const indexed = artworkIndex?.value ?? [];
  if (prepared.artwork && !indexed.includes(prepared.artwork.id)) indexed.push(prepared.artwork.id);
  if (indexed.length > 128) fail('This season has reached its 128-image upload limit.');
  await commit({
    id: prepared.id,
    actor,
    action: 'season.imported',
    writes: [
      { key: seasonKeys.season(prepared.id), before: existing.raw, after: season },
      ...(prepared.artwork && artworkRecord && artworkIndex
        ? [
            {
              key: seasonKeys.artwork(prepared.artwork.id),
              before: artworkRecord.raw,
              after: artworkRecord.value ? undefined : prepared.artwork,
            },
            { key: seasonKeys.artworkIndex(prepared.id), before: artworkIndex.raw, after: indexed },
          ]
        : []),
    ],
    index: { id: prepared.id, score: Date.parse(now) },
    detail: { slug: prepared.definition.slug, number: prepared.definition.number },
  });
  return { season, created: true };
}
