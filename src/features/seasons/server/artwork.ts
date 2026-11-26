import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireApiSession } from '../../../server/http';
import { identifier, type Definition } from '../contracts';
import { fail, loadSeason, readRecord, seasonKeys } from './store';

const ARTWORK_OUTPUT_LIMIT = 256 * 1024;
const artworkRecordSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  data: z.string().max(350000),
  width: z.number().int().min(1).max(1600),
  height: z.number().int().min(1).max(900),
});

export async function validateArtworkReferences(
  definition: Pick<Definition, 'artwork'> & { rewards?: Definition['rewards'] },
) {
  const ids = new Set(
    [definition.artwork?.id, ...(definition.rewards ?? []).map((v) => v.artwork?.id)].filter(Boolean),
  );
  const records = await Promise.all([...ids].map((id) => readRecord(seasonKeys.artwork(id))));
  if (records.some((record) => !artworkRecordSchema.safeParse(record.value).success))
    fail('Upload the selected artwork before saving.', 400);
}
export async function getArtwork(
  _request: Request,
  context: { params: Promise<{ seasonId: string; artworkId: string }> },
) {
  await requireApiSession();
  const { seasonId, artworkId } = await context.params;
  if (!identifier.safeParse(seasonId).success || !/^[a-f0-9]{64}$/.test(artworkId)) fail('Artwork not found.', 404);
  const season = (await loadSeason(seasonId)).value;
  if (['draft', 'preview'].includes(season.phase)) fail('Artwork not found.', 404);
  const refs = [
    season.definition.artwork?.id,
    season.presentation?.artwork?.id,
    ...season.definition.rewards.map((v) => v.artwork?.id),
  ];
  if (!refs.includes(artworkId)) fail('Artwork not found.', 404);
  const record = artworkRecordSchema.safeParse((await readRecord(seasonKeys.artwork(artworkId))).value);
  if (!record.success || record.data.id !== artworkId) fail('Artwork not found.', 404);
  const data = Buffer.from(record.data.data, 'base64');
  if (data.length > ARTWORK_OUTPUT_LIMIT || createHash('sha256').update(data).digest('hex') !== artworkId)
    throw new Error('Invalid artwork record.');
  return new Response(data, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(data.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline; filename="season-artwork.webp"',
    },
  });
}
