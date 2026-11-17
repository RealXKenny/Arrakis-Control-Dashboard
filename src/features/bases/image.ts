export type ThumbnailType = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Identify an image by its magic bytes. The client-declared MIME type is never trusted,
 * so a script renamed to .png is rejected rather than served back to other members.
 */
export function sniffThumbnail(bytes: Uint8Array): ThumbnailType | null {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
