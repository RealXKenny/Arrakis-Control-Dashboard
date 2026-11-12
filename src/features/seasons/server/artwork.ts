import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError } from '../../../lib/errors';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { isDashboardAdmin, requireRecentSignIn } from '../../admin/server/access';
import { requireApiAdmin, spendAdminBudget } from '../../admin/server/api-access';
import {
  identifier,
  seasonState,
  presentationSchema,
  seasonPresentation,
  type Definition,
  type Presentation,
} from '../contracts';
import { commit, fail, loadSeason, readRecord, seasonKeys } from './store';

export const ARTWORK_INPUT_LIMIT = 3 * 1024 * 1024;
export const ARTWORK_OUTPUT_LIMIT = 256 * 1024;
const artworkRecordSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  data: z.string().max(350000),
  width: z.number().int().min(1).max(1600),
  height: z.number().int().min(1).max(900),
});

/** Decode pixels, reject animation/decompression bombs, then strip metadata by re-encoding. */
export async function normalizeArtwork(bytes: Uint8Array) {
  if (bytes.byteLength > ARTWORK_INPUT_LIMIT) fail('Artwork exceeds the 3 MiB upload limit.', 413);
  const png = Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP';
  if (!png && !jpeg && !webp) fail('Upload a PNG, JPEG or WebP image. SVG and other formats are not accepted.', 400);
  try {
    const image = sharp(bytes, { limitInputPixels: 8000000, failOn: 'warning', sequentialRead: true });
    const metadata = await image.metadata();
    if (
      !['png', 'jpeg', 'webp'].includes(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 4096 ||
      metadata.height > 4096 ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error('Invalid image dimensions or animation.');
    const { data, info } = await image
      .rotate()
      .resize({ width: 1600, height: 900, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 3 })
      .timeout({ seconds: 3 })
      .toBuffer({ resolveWithObject: true });
    if (data.byteLength > ARTWORK_OUTPUT_LIMIT)
      fail('The optimized image exceeds 256 KiB. Use simpler or smaller artwork.', 413);
    return {
      id: createHash('sha256').update(data).digest('hex'),
      data: data.toString('base64'),
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    fail('Upload a valid, non-animated PNG, JPEG or WebP, at most 4096px per side and 8 million pixels.', 400);
  }
}
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
export async function uploadArtwork(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiAdmin();
  requireRecentSignIn(session, { highRisk: true });
  await spendAdminBudget(session);
  const limit = await checkRateLimit(`v2:season-artwork:${session.user.id}`, { limit: 6, windowMs: 60000 });
  if (limit.storageUnavailable || !limit.allowed)
    fail('Artwork uploads are temporarily limited. Try again shortly.', limit.storageUnavailable ? 503 : 429);
  const params = new URL(request.url).searchParams;
  const id = identifier.safeParse(params.get('season'));
  if (!id.success) fail('Save a draft before uploading artwork.', 400);
  const season = await loadSeason(id.data);
  if (season.value.revision !== params.get('revision')) fail('Season changed. Reload before uploading.');
  if (['ended', 'archived'].includes(seasonState(season.value))) fail('Completed season artwork is immutable.');
  const bytes = await readBoundedBody(request, ARTWORK_INPUT_LIMIT);
  if (!bytes) fail('Artwork exceeds the 3 MiB upload limit.', 413);
  const artwork = await normalizeArtwork(bytes);
  const [record, index] = await Promise.all([
    readRecord(seasonKeys.artwork(artwork.id)),
    readRecord<string[]>(seasonKeys.artworkIndex(id.data)),
  ]);
  const ids = index.value ?? [];
  if (!ids.includes(artwork.id)) ids.push(artwork.id);
  if (ids.length > 128) fail('This season has reached its 128-image upload limit. Reuse an existing image.');
  await commit({
    id: id.data,
    actor: session.user.id,
    action: 'artwork.uploaded',
    beforeDeadline: season.value.phase === 'published' ? Date.parse(season.value.definition.endsAt) : undefined,
    writes: [
      { key: seasonKeys.season(id.data), before: season.raw },
      { key: seasonKeys.artwork(artwork.id), before: record.raw, after: record.value ? undefined : artwork },
      { key: seasonKeys.artworkIndex(id.data), before: index.raw, after: ids },
    ],
    detail: { artworkId: artwork.id },
  });
  return json({ ok: true, artwork: { id: artwork.id, width: artwork.width, height: artwork.height } });
}
export async function getArtwork(
  _request: Request,
  context: { params: Promise<{ seasonId: string; artworkId: string }> },
) {
  const session = await requireApiSession();
  const { seasonId, artworkId } = await context.params;
  if (!identifier.safeParse(seasonId).success || !/^[a-f0-9]{64}$/.test(artworkId)) fail('Artwork not found.', 404);
  const season = (await loadSeason(seasonId)).value;
  const admin = isDashboardAdmin(session);
  if (!admin && ['draft', 'preview'].includes(season.phase)) fail('Artwork not found.', 404);
  const refs = [
    season.definition.artwork?.id,
    season.presentation?.artwork?.id,
    ...season.definition.rewards.map((v) => v.artwork?.id),
  ];
  // Administrators may preview a freshly uploaded image before saving a definition that references it.
  if (!refs.includes(artworkId)) {
    const uploaded = admin ? (await readRecord<string[]>(seasonKeys.artworkIndex(seasonId))).value : null;
    if (!uploaded?.includes(artworkId)) fail('Artwork not found.', 404);
  }
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

export async function savePresentation(
  id: string,
  revision: string,
  presentation: Presentation,
  reason: string,
  actor: string,
) {
  const validated = presentationSchema.parse(presentation);
  z.string().trim().min(10).max(500).parse(reason);
  const record = await loadSeason(id);
  if (record.value.revision !== revision) fail('Season changed. Refresh before editing its presentation.');
  if (!['scheduled', 'active'].includes(seasonState(record.value)))
    fail('Only scheduled and active seasons accept live presentation edits.');
  await validateArtworkReferences(validated);
  // Engine invariants and frozen reward artwork stay in definition; this overlay is display-only.
  const season = {
    ...record.value,
    revision: randomUUID(),
    version: (record.value.version ?? 0) + 1,
    presentation: validated,
  };
  await commit({
    id,
    actor,
    action: 'season.presentation_updated',
    beforeDeadline: Date.parse(season.definition.endsAt),
    writes: [
      { key: seasonKeys.season(id), before: record.raw, after: season },
      {
        key: seasonKeys.presentationSnapshot(id, season.revision),
        before: '',
        after: {
          before: seasonPresentation(record.value),
          after: validated,
          reason,
          actor,
          at: new Date().toISOString(),
        },
      },
    ],
    detail: { reason, snapshotId: season.revision },
  });
  return season;
}
