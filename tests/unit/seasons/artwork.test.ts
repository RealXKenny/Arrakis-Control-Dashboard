import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { normalizeArtwork, ARTWORK_INPUT_LIMIT } from '../../../src/features/seasons/server/artwork';

describe('season artwork decoding boundary', () => {
  it('accepts raster pixels, strips metadata, bounds dimensions and hashes the encoded result', async () => {
    const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#be9d59' } })
      .withMetadata()
      .png()
      .toBuffer();
    const artwork = await normalizeArtwork(input);
    const metadata = await sharp(Buffer.from(artwork.data, 'base64')).metadata();
    expect(artwork.id).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(1600);
    expect(metadata.height).toBeLessThanOrEqual(900);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect((await normalizeArtwork(input)).id).toBe(artwork.id);
  });
  it('accepts JPEG/WebP and rejects renamed SVG, corrupt headers and oversized compressed dimensions', async () => {
    for (const format of ['jpeg', 'webp'] as const) {
      const input = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#123456' } })
        .toFormat(format)
        .toBuffer();
      expect((await normalizeArtwork(input)).width).toBe(32);
    }
    await expect(
      normalizeArtwork(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(normalizeArtwork(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]))).rejects.toMatchObject({
      statusCode: 400,
    });
    const tooWide = await sharp({ create: { width: 4100, height: 1, channels: 3, background: '#123456' } })
      .png()
      .toBuffer();
    await expect(normalizeArtwork(tooWide)).rejects.toMatchObject({ statusCode: 400 });
    await expect(normalizeArtwork(new Uint8Array(ARTWORK_INPUT_LIMIT + 1))).rejects.toMatchObject({ statusCode: 413 });
  });
});
