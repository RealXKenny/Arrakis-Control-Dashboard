import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../../../lib/errors';
import { sniffThumbnail } from '../../bases/image';
import { EVENT_SUBMISSION_IMAGE_MAX_BYTES, EVENT_SUBMISSION_STORED_IMAGE_MAX_BYTES } from '../submissions';

export async function processSubmissionImage(value: Uint8Array) {
  if (!value.length || value.length > EVENT_SUBMISSION_IMAGE_MAX_BYTES)
    throw new AppError('Evidence images must be no larger than 700 KiB.', 413, 'SUBMISSION_IMAGE_TOO_LARGE', true);
  const type = sniffThumbnail(value);
  if (!type) throw new AppError('Evidence must be a PNG, JPEG or WebP image.', 415, 'INVALID_SUBMISSION_IMAGE', true);
  try {
    const source = sharp(value, { limitInputPixels: 16_000_000, failOn: 'error' });
    const metadata = await source.metadata();
    if ((metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height) throw new Error('Invalid image');
    const bytes = await source
      .rotate()
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
    if (bytes.length > EVENT_SUBMISSION_STORED_IMAGE_MAX_BYTES) throw new Error('Image output too large');
    return { bytes, version: randomUUID() };
  } catch {
    throw new AppError(
      'The evidence image could not be validated and resized. Use a smaller static image.',
      400,
      'INVALID_SUBMISSION_IMAGE',
      true,
    );
  }
}
