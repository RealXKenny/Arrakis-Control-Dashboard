import { describe, expect, it } from 'vitest';
import assetHandler from '../../src/pages/api/assets/[...path]';
import { responseMock } from '../helpers/response';

describe('source asset handler', () => {
  it('serves known assets with their content type and cache policy', async () => {
    const res = responseMock();
    await assetHandler({ method: 'GET', query: { path: ['maps', 'atreides.webp'] } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('image/webp');
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=3600, must-revalidate');
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it('rejects traversal, unsupported files, and unsupported methods', async () => {
    for (const parts of [
      ['..', '.env'],
      ['items', 'missing.png'],
      ['items', 'item.svg'],
    ]) {
      const res = responseMock();
      await assetHandler({ method: 'GET', query: { path: parts } }, res);
      expect(res.statusCode).toBe(404);
    }

    const res = responseMock();
    await assetHandler({ method: 'POST', query: { path: ['favicon.ico'] } }, res);
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, HEAD');
  });
});
