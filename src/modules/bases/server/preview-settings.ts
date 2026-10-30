import '../../../lib/assert-server';
import { createHash, randomBytes } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextResponse, isSameOriginRequest } from '../../../infrastructure/pages-api';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis';
import { withTimeout } from '../../../lib/timeout';
import { requireOwnedBaseExport } from './owned-export';
import { baseViewSchema, previewSettingsSchema, type PreviewSettings } from '../utils/preview-settings';

export const previewId = (userId: string, baseId: string) =>
  createHash('sha256').update(`${userId}:${baseId}`).digest('hex').slice(0, 24);
export const previewKey = (id: string) => `arrakis:base-preview:${id}`;

export async function getPreviewSettings(id: string): Promise<PreviewSettings | null> {
  const redis = getRedisClient();
  if (!redis) throw new AppError('Preview storage is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  const value = await withTimeout(redis.get(previewKey(id)), 12000);
  return value === null ? null : previewSettingsSchema.parse(value);
}

export function validatePreviewImage(image: string) {
  const bytes = Buffer.from(image.slice('data:image/png;base64,'.length), 'base64');
  if (
    bytes.length > 1024 * 1024 ||
    bytes.length < 33 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    bytes.readUInt32BE(16) !== 640 ||
    bytes.readUInt32BE(20) !== 360
  )
    throw new AppError('Use a 640 × 360 preview capture.', 400, 'INVALID_PREVIEW', true);
  try {
    if (bytes[24] !== 8 || ![2, 6].includes(bytes[25]) || bytes[26] || bytes[27] || bytes[28]) throw new Error();
    const chunks: Buffer[] = [];
    let end = false;
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (length > bytes.length - offset - 12) throw new Error();
      if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
      if (type === 'IEND') {
        end = length === 0 && offset === bytes.length;
        break;
      }
    }
    const expected = (640 * (bytes[25] === 6 ? 4 : 3) + 1) * 360;
    if (!end || !chunks.length || inflateSync(Buffer.concat(chunks), { maxOutputLength: expected }).length !== expected)
      throw new Error();
  } catch {
    throw new AppError('The captured PNG is invalid. Please take the picture again.', 400, 'INVALID_PREVIEW', true);
  }
}

export async function GET(req: NextApiRequest, res: NextApiResponse) {
  const { session } = await requireOwnedBaseExport(req, res);
  const preview = await getPreviewSettings(previewId(session.user.id, String(req.query.baseId)));
  return NextResponse.json({ ok: true, view: preview?.view ?? null, hasPicture: Boolean(preview?.image) });
}

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  if (!isSameOriginRequest(req)) throw new AppError('Invalid request origin.', 403, 'INVALID_ORIGIN', true);
  const parsed = previewSettingsSchema.omit({ revision: true }).safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid preview settings.', 400, 'INVALID_PREVIEW', true);
  const input = parsed.data;
  validatePreviewImage(input.image);
  const { session } = await requireOwnedBaseExport(req, res);
  const id = previewId(session.user.id, String(req.query.baseId));
  const preview = { ...input, view: baseViewSchema.parse(input.view), revision: randomBytes(12).toString('hex') };
  const redis = getRedisClient();
  if (!redis) throw new AppError('Preview storage is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  // Update the saved view and any published card atomically, without changing publication order.
  await withTimeout(
    redis.eval(
      `
    redis.call('SET', KEYS[1], ARGV[1])
    local raw = redis.call('GET', KEYS[2])
    if raw then
      local record = cjson.decode(raw)
      local previous = redis.call('GET', KEYS[3])
      local score = previous and redis.call('ZSCORE', KEYS[4], previous)
      if previous then redis.call('ZREM', KEYS[4], previous) end
      local preview = cjson.decode(ARGV[1])
      record.summary.previewRevision = preview.revision
      local summary = cjson.encode(record.summary)
      redis.call('SET', KEYS[3], summary)
      if score then redis.call('ZADD', KEYS[4], score, summary) end
    end
    return 1
  `,
      [
        previewKey(id),
        `arrakis:base-marketplace:listing:${id}`,
        `arrakis:base-marketplace:summary-state:${id}`,
        'arrakis:base-marketplace:listings',
      ],
      [JSON.stringify(preview)],
    ),
    12000,
  );
  return NextResponse.json({ ok: true, view: preview.view, revision: preview.revision });
}
