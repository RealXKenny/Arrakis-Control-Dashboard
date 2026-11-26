import { randomBytes } from 'node:crypto';
import { AppError } from '../../../../../lib/errors';
import { readBoundedBody } from '../../../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../../../lib/security/rate-limit';
import { sniffThumbnail, type ThumbnailType } from '../../../../../features/bases/image';
import {
  BASE_LAYOUT_MAX_BYTES,
  BASE_THUMBNAIL_MAX_BYTES,
  BASE_UPLOAD_MAX_BYTES,
  BaseValidationError,
  buildBaseRecord,
  parseLayoutJson,
  uploadMetaSchema,
} from '../../../../../features/bases/schema';
import { ownerKeyFor, publishBase, MAX_LISTINGS_PER_USER } from '../../../../../features/bases/server/marketplace';
import { assertSameOrigin, json, requireApiSession, route } from '../../../../../server/http';

// Uploads are user content and cost Redis memory: 10 per hour per member, on top of the 25-listing cap.
const UPLOADS_PER_HOUR = { limit: 10, windowMs: 60 * 60_000 };

function fileField(form: FormData, name: string): File | null {
  const value = form.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const session = await requireApiSession();

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
    throw new AppError('Upload a base as multipart form data.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  }
  const limit = await checkRateLimit(`v2:bases:upload:${session.user.id}`, UPLOADS_PER_HOUR);
  if (!limit.allowed) {
    throw new AppError(`Upload limit reached. Try again in ${limit.retryAfter} seconds.`, 429, 'RATE_LIMITED', true);
  }

  const body = await readBoundedBody(request, BASE_UPLOAD_MAX_BYTES);
  if (!body) throw new AppError('The upload is too large.', 413, 'PAYLOAD_TOO_LARGE', true);
  let form: FormData;
  try {
    form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type')! } }).formData();
  } catch {
    throw new AppError('The upload could not be read.', 400, 'INVALID_FORM', true);
  }

  const file = fileField(form, 'file');
  if (!file) throw new AppError('Choose a base layout .json file.', 400, 'FILE_REQUIRED', true);
  if (file.size > BASE_LAYOUT_MAX_BYTES)
    throw new AppError('The file exceeds the 2 MiB base limit.', 413, 'FILE_TOO_LARGE', true);

  const meta = uploadMetaSchema.safeParse({
    title: String(form.get('title') ?? ''),
    description: String(form.get('description') ?? ''),
  });
  if (!meta.success) throw new AppError('Title or description is too long.', 400, 'INVALID_META', true);

  let thumbnail: { type: ThumbnailType; base64: string } | null = null;
  const image = fileField(form, 'thumbnail');
  if (image) {
    if (image.size > BASE_THUMBNAIL_MAX_BYTES) {
      throw new AppError('The picture exceeds the 700 KiB limit.', 413, 'THUMBNAIL_TOO_LARGE', true);
    }
    const bytes = new Uint8Array(await image.arrayBuffer());
    const type = sniffThumbnail(bytes);
    if (!type) throw new AppError('The picture must be a PNG, JPEG or WebP image.', 415, 'INVALID_THUMBNAIL', true);
    thumbnail = { type, base64: Buffer.from(bytes).toString('base64') };
  }

  try {
    const layout = parseLayoutJson(await file.text());
    const id = randomBytes(12).toString('hex');
    const author = (
      session.linkedPlayerName ||
      session.user.global_name ||
      session.user.username ||
      'Community member'
    ).slice(0, 100);
    const record = buildBaseRecord({
      id,
      title: meta.data.title || layout.name || 'Untitled base',
      author,
      description: meta.data.description || undefined,
      layout,
      ownerKey: ownerKeyFor(session),
      hasThumbnail: thumbnail !== null,
      publishedAt: new Date().toISOString(),
    });

    const outcome = await publishBase(record, thumbnail);
    if (outcome === 'user-limit') {
      throw new AppError(
        `You can share up to ${MAX_LISTINGS_PER_USER} bases. Remove one first.`,
        409,
        'USER_LIMIT',
        true,
      );
    }
    if (outcome === 'storage-limit') {
      throw new AppError(
        'You have used your share of marketplace storage. Remove a base first.',
        409,
        'STORAGE_LIMIT',
        true,
      );
    }
    if (outcome === 'full') {
      throw new AppError('The marketplace is full right now. Try again later.', 503, 'MARKETPLACE_FULL', true);
    }
    return json({ ok: true, id }, 201);
  } catch (error) {
    if (error instanceof BaseValidationError) throw new AppError(error.message, 422, 'INVALID_BASE', true);
    throw error;
  }
});
