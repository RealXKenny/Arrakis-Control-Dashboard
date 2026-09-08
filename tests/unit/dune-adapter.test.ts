import { afterEach, expect, it, vi } from 'vitest';
import { getDiscordPlayer } from '../../src/infrastructure/dune';

vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'INFO' }),
  requireServerEnv: () => ({ CONSOLE_URL: 'https://console.test/prefix', ADAPTER_TOKEN: 'test-adapter-token' }),
}));
afterEach(() => vi.unstubAllGlobals());

it('preserves the configured URL prefix and actor when requesting a linked player', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ linked: true, pawnId: 'player' }));
  vi.stubGlobal('fetch', fetchMock);
  const actor = { userId: 'user', guildId: 'guild', roleIds: ['member'] };
  await expect(getDiscordPlayer(actor)).resolves.toEqual({ linked: true, pawnId: 'player' });
  expect(fetchMock).toHaveBeenCalledWith(
    'https://console.test/prefix/api/integrations/discord/players/me',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ actor }),
      cache: 'no-store',
      headers: expect.objectContaining({ Authorization: 'Bearer test-adapter-token' }),
    }),
  );
});

it('does not include upstream response bodies in adapter failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('provider-secret', { status: 503 })));
  await expect(getDiscordPlayer({})).rejects.toMatchObject({ message: 'Discord adapter request failed', status: 503 });
});
