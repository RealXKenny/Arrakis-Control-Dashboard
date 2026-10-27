import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseModelError, fetchBaseModelExport } from '../../src/modules/bases/utils/model-export';

afterEach(() => vi.unstubAllGlobals());
describe('private base preview export', () => {
  it('loads only the encoded same-origin route without a client cache', async () => {
    const fetcher = vi.fn(async () => Response.json({ instances: [], placeables: [] }));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchBaseModelExport('my/base', new AbortController().signal)).resolves.toEqual({
      instances: [],
      placeables: [],
    });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/bases/my%2Fbase/export',
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin', signal: expect.any(AbortSignal) }),
    );
  });
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [502, 'unavailable'],
  ])('sanitizes %s without returning its error body', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('private upstream details', { status: Number(status) })),
    );
    try {
      await fetchBaseModelExport('base', new AbortController().signal);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BaseModelError);
      expect((error as BaseModelError).code).toBe(code);
      expect(String(error)).not.toContain('private upstream');
    }
  });
  it('rejects announced or streamed oversized exports before decoding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } })),
    );
    await expect(fetchBaseModelExport('base', new AbortController().signal)).rejects.toMatchObject({
      code: 'too-large',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))),
    );
    await expect(fetchBaseModelExport('base', new AbortController().signal)).rejects.toMatchObject({
      code: 'too-large',
    });
  });
  it('does no work for invalid IDs or an already-cancelled viewer', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchBaseModelExport('', new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' });
    await expect(fetchBaseModelExport('x'.repeat(129), new AbortController().signal)).rejects.toMatchObject({
      code: 'unavailable',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(fetchBaseModelExport('base', controller.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
