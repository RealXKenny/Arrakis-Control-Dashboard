import { beforeEach, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
const { owned, redis, sameOrigin } = vi.hoisted(() => ({
  owned: vi.fn(),
  redis: { get: vi.fn(), eval: vi.fn() },
  sameOrigin: vi.fn(),
}));
vi.mock('../../src/modules/bases/server/owned-export', () => ({ requireOwnedBaseExport: owned }));
vi.mock('../../src/lib/redis', () => ({ getRedisClient: () => redis }));
vi.mock('../../src/infrastructure/pages-api', async (original) => ({
  ...(await original()),
  isSameOriginRequest: sameOrigin,
}));
import {
  GET,
  POST,
  previewId,
  previewKey,
  validatePreviewImage,
} from '../../src/modules/bases/server/preview-settings';
import { baseViewSchema } from '../../src/modules/bases/utils/preview-settings';
const view = { position: [0, 0.3, 2], target: [0, 0, 0], facing: 42 };
const revision = 'a'.repeat(24);
const header = Buffer.alloc(33);
Buffer.from('89504e470d0a1a0a', 'hex').copy(header);
header.writeUInt32BE(13, 8);
header.write('IHDR', 12);
header.writeUInt32BE(640, 16);
header.writeUInt32BE(360, 20);
header[24] = 8;
header[25] = 6;
const pixels = deflateSync(Buffer.alloc((640 * 4 + 1) * 360));
const idat = Buffer.alloc(12 + pixels.length);
idat.writeUInt32BE(pixels.length, 0);
idat.write('IDAT', 4);
pixels.copy(idat, 8);
const iend = Buffer.alloc(12);
iend.write('IEND', 4);
const image = `data:image/png;base64,${Buffer.concat([header, idat, iend]).toString('base64')}`;
const request = (body: unknown) => ({ body, query: { baseId: '123' }, headers: {} }) as never;
beforeEach(() => {
  vi.clearAllMocks();
  sameOrigin.mockReturnValue(true);
  owned.mockResolvedValue({ session: { user: { id: 'owner' } } });
  redis.get.mockResolvedValue(null);
  redis.eval.mockResolvedValue(1);
});

it('rejects cross-origin writes and unowned bases before saving', async () => {
  sameOrigin.mockReturnValueOnce(false);
  await expect(POST(request({ view, image }), {} as never)).rejects.toMatchObject({ statusCode: 403 });
  expect(owned).not.toHaveBeenCalled();
  owned.mockRejectedValueOnce(new Error('not owned'));
  await expect(POST(request({ view, image }), {} as never)).rejects.toThrow('not owned');
  expect(redis.eval).not.toHaveBeenCalled();
});

it('saves a base-specific view and returns it without its private image payload', async () => {
  const response = await POST(request({ view, image }), {} as never);
  expect(JSON.parse(response.body).view).toEqual(view);
  const [, keys, args] = redis.eval.mock.calls[0];
  expect(keys[0]).toBe(previewKey(previewId('owner', '123')));
  expect(previewId('other', '123')).not.toBe(previewId('owner', '123'));
  expect(JSON.parse(args[0]).view).toEqual(view);
  redis.get.mockResolvedValue({ view, revision, image: 'data:image/png;base64,AAAA' });
  const read = await GET(request(null), {} as never);
  expect(JSON.parse(read.body)).toEqual({ ok: true, view, hasPicture: true });
});

it('bounds camera settings and rejects non-capture or oversized pictures', async () => {
  expect(baseViewSchema.safeParse({ ...view, position: [0, 0, 0] }).success).toBe(false);
  expect(baseViewSchema.safeParse({ ...view, facing: Infinity }).success).toBe(false);
  expect(() => validatePreviewImage('data:image/png;base64,AAAA')).toThrow();
  expect(() => validatePreviewImage(image)).not.toThrow();
  await expect(
    POST(request({ view, image: `data:image/png;base64,${header.toString('base64')}` }), {} as never),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(redis.eval).not.toHaveBeenCalled();
});

it('requires a picture and keeps old listing order when replacing it', async () => {
  await expect(POST(request({ view }), {} as never)).rejects.toMatchObject({ statusCode: 400 });
  await expect(POST(request({ reset: true }), {} as never)).rejects.toMatchObject({ statusCode: 400 });
  await POST(request({ view, image }), {} as never);
  expect(redis.eval.mock.calls[0][0]).toContain("redis.call('ZSCORE'");
});
