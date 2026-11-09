import { describe, expect, it } from 'vitest';
import assetHandler from '../../src/pages/api/assets/[...path]';
import { responseMock } from '../helpers/response';
import voiceManifest from '../../src/assets/audio/casino/solaris-v1/manifest.json';

describe('source asset handler', () => {
  it('serves only manifested local dealer clips with the existing security headers', async () => {
    const file = voiceManifest.clips['place your bets.'].file;
    for (const method of ['GET', 'HEAD']) {
      const res = responseMock();
      await assetHandler({ method, query: { path: ['audio', 'casino', 'solaris-v1', file] } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.getHeader('Content-Type')).toBe('audio/mpeg');
      expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff');
      expect(res.getHeader('Cross-Origin-Resource-Policy')).toBe('same-origin');
      expect(Number(res.getHeader('Content-Length'))).toBe(voiceManifest.clips['place your bets.'].bytes);
    }
    for (const file of ['manifest.json', 'LICENSE.txt', '000000000000000000000000.mp3', '../.env', 'voice.wav']) {
      const res = responseMock();
      await assetHandler({ method: 'GET', query: { path: ['audio', 'casino', 'solaris-v1', file] } }, res);
      expect(res.statusCode).toBe(404);
    }
  });
  it('serves public share PNGs without exposing their sources or arbitrary files', async () => {
    for (const name of ['preview-v1.png', 'mark-v1.png']) {
      const res = responseMock();
      await assetHandler({ method: 'GET', query: { path: ['share', name] } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.getHeader('Content-Type')).toBe('image/png');
      expect((res.body as Buffer).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
    for (const name of ['preview-v1.svg', 'surprise.png', '../.env']) {
      const res = responseMock();
      await assetHandler({ method: 'GET', query: { path: ['share', name] } }, res);
      expect(res.statusCode).toBe(404);
    }
  });
  it('serves measured Hagga terrain and only allowlisted model packs', async () => {
    for (const parts of [
      ['terrain', 'hagga.hf.gz'],
      ['terrain', 'hagga.json.gz'],
      ['models', 'native', 'catalog.json.gz'],
      ['models', 'native', 'meshpacks', 'meshpack-9.bin.gz'],
      ['models', 'client', 'catalog.json.gz'],
      ['models', 'client', 'client-meshes-0.bin.gz'],
      ['models', 'client', 'client-textures-0.bin.gz'],
    ]) {
      const res = responseMock();
      await assetHandler({ method: 'HEAD', query: { path: parts } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.getHeader('Content-Type')).toBe('application/gzip');
      expect(Number(res.getHeader('Content-Length'))).toBeLessThan(32 * 1024 * 1024);
    }
    const catalog = responseMock();
    await assetHandler({ method: 'HEAD', query: { path: ['models', 'client', 'catalog.json.gz'] } }, catalog);
    expect(catalog.getHeader('Cache-Control')).toBe('no-cache');
    for (const parts of [
      ['models', 'native', 'meshpacks', 'meshpack-10.bin.gz'],
      ['models', 'client', 'client-meshes-100.bin.gz'],
      ['models', 'client', 'coverage.json'],
      ['models', 'visual', 'catalog.json.gz'],
      ['models', '..', '.env'],
      ['terrain', 'hagga.bin.gz'],
    ]) {
      const res = responseMock();
      await assetHandler({ method: 'GET', query: { path: parts } }, res);
      expect(res.statusCode).toBe(404);
    }
  });
  it('serves known assets with their content type and cache policy', async () => {
    const res = responseMock();
    await assetHandler({ method: 'GET', query: { path: ['maps', 'atreides.webp'] } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('image/webp');
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=3600, must-revalidate');
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff');
    expect(res.getHeader('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(res.getHeader('Content-Security-Policy')).toContain("default-src 'none'");
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it('rejects traversal, unsupported files, and unsupported methods', async () => {
    for (const parts of [
      ['..', '.env'],
      ['items', 'missing.png'],
      ['items', 'item.svg'],
      ['terrain', 'layout-12.bin.gz'],
      ['terrain', 'surprise.bin.gz'],
      ['terrain', 'tex', 'det1.bin.gz'],
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

  it('serves only allowlisted compressed terrain bundles', async () => {
    const res = responseMock();
    await assetHandler({ method: 'HEAD', query: { path: ['terrain', 'layout-3.json.gz'] } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/gzip');
    expect(res.getHeader('Content-Length')).toBeTruthy();

    const texture = responseMock();
    await assetHandler({ method: 'HEAD', query: { path: ['terrain', 'tex', 'det1.rgba.gz'] } }, texture);
    expect(texture.statusCode).toBe(200);
    expect(texture.getHeader('Content-Type')).toBe('application/gzip');
  });

  it('serves only the four allowlisted lossless map quadrants', async () => {
    const tile = responseMock();
    await assetHandler({ method: 'HEAD', query: { path: ['maps', 'deep-desert', '1-1.webp'] } }, tile);
    expect(tile.statusCode).toBe(200);
    expect(tile.getHeader('Content-Type')).toBe('image/webp');
    expect(Number(tile.getHeader('Content-Length'))).toBeGreaterThan(0);
    expect(Number(tile.getHeader('Content-Length'))).toBeLessThan(8 * 1024 * 1024);

    for (const parts of [
      ['maps', 'deep-desert', '2-0.webp'],
      ['maps', 'deep-desert', '0-0.png'],
      ['maps', 'other', '0-0.webp'],
      ['maps', 'deep-desert', 'nested', '0-0.webp'],
    ]) {
      const res = responseMock();
      await assetHandler({ method: 'GET', query: { path: parts } }, res);
      expect(res.statusCode).toBe(404);
    }
  });
});
