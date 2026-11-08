import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ LOG_LEVEL: 'FATAL', NODE_ENV: 'test' }) }));

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

function listen(handler: Parameters<typeof createServer>[1]) {
  return new Promise<Server>((resolve) => {
    const server = createServer(handler).listen(0, '127.0.0.1', () => resolve(server));
    servers.push(server);
  });
}

describe('Console transport redirects', () => {
  it('refuses to follow a redirect and never reaches the redirect target', async () => {
    let targetHits = 0;
    const target = await listen((_request, response) => {
      targetHits += 1;
      response.end('{}');
    });
    const redirecting = await listen((_request, response) => {
      response.writeHead(302, { Location: `http://127.0.0.1:${(target.address() as AddressInfo).port}/leak` });
      response.end();
    });
    const { sendProviderRequest } = await import('../../../src/server/integrations/dunedocker/transport');
    await expect(
      sendProviderRequest({
        provider: 'console',
        url: new URL(`http://127.0.0.1:${(redirecting.address() as AddressInfo).port}/api/health`),
        method: 'GET',
        headers: { Authorization: 'Bearer fixture' },
        timeoutMs: 2000,
      }),
    ).rejects.toMatchObject({ name: 'DuneConsoleApiError' });
    expect(targetHits).toBe(0);
  });
});
