import { beforeEach, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { POST } from '../src/modules/bases/server/import';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  player: vi.fn(),
  reserve: vi.fn(),
  finish: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('../src/infrastructure/cookies', () => ({ cookies: () => ({ get: () => ({ value: 'session' }) }) }));
vi.mock('../src/lib/session-store', () => ({ getSession: state.session }));
vi.mock('../src/modules/player/server/linked-player', () => ({ getLinkedPlayer: state.player }));
vi.mock('../src/modules/bases/server/history', () => ({
  importHistory: async () => [],
  reserveImport: state.reserve,
  finishImport: state.finish,
}));
vi.mock('../src/infrastructure/dune', () => ({ warmupDuneClient: async () => ({ requestMultipart: state.upload }) }));
const req = () =>
  ({
    headers: { host: 'portal.test', origin: 'http://portal.test' },
    body: {
      requestId: '11111111-1111-4111-8111-111111111111',
      title: 'Home',
      blueprint: { instances: [{ instance_id: 1, building_type: 'Foundation', x: 0, y: 0, z: 0, rotation: 0 }] },
    },
  }) as unknown as NextApiRequest;
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'owner' }, expiresAt: Date.now() + 10000 });
  state.player.mockResolvedValue({ linked: true, pawnId: '42' });
  state.reserve.mockResolvedValue(null);
  state.finish.mockResolvedValue(undefined);
  state.upload.mockResolvedValue({ ok: true });
});
it('imports only to the verified character and ignores a supplied target', async () => {
  const request = req();
  request.body.player_id = '999';
  const response = await POST(request, {} as NextApiResponse);
  expect(JSON.parse(response.body!).record.status).toBe('imported');
  const form = state.upload.mock.calls[0][2] as FormData;
  expect(form.get('player_id')).toBe('42');
  expect(state.upload.mock.calls[0][3]).toBe(false);
});
it('rejects cross-origin and signed-out imports', async () => {
  const request = req();
  request.headers.origin = 'https://other.test';
  await expect(POST(request, {} as NextApiResponse)).rejects.toMatchObject({ statusCode: 403 });
  state.session.mockResolvedValue(null);
  await expect(POST(req(), {} as NextApiResponse)).rejects.toMatchObject({ statusCode: 401 });
  expect(state.upload).not.toHaveBeenCalled();
});
it('does not submit an already reserved operation twice', async () => {
  state.reserve.mockResolvedValue({ status: 'pending' });
  const response = await POST(req(), {} as NextApiResponse);
  expect(JSON.parse(response.body!).record.status).toBe('pending');
  expect(state.upload).not.toHaveBeenCalled();
});
it('reports an uncertain delivery safely without retrying the mutation', async () => {
  state.upload.mockRejectedValue(new Error('private-upstream-token'));
  const response = await POST(req(), {} as NextApiResponse);
  expect(JSON.parse(response.body!).record.status).toBe('unconfirmed');
  expect(response.body).not.toContain('private-upstream-token');
  expect(state.upload).toHaveBeenCalledTimes(1);
});
