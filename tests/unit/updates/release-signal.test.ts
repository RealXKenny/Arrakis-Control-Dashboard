import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'synthetic-webhook-secret-0123456789abcdef';

async function load() {
  vi.resetModules();
  return import('../../../src/features/updates/server/release-signal');
}

function delivery(payload: unknown, options: { event?: string; secret?: string; signature?: string } = {}) {
  const body = JSON.stringify(payload);
  const signature =
    options.signature ??
    `sha256=${createHmac('sha256', options.secret ?? SECRET)
      .update(body)
      .digest('hex')}`;
  return new Request('https://dash.example.test/api/v2/updates/github', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-github-event': options.event ?? 'release',
      'x-hub-signature-256': signature,
    },
  });
}

const release = (overrides: Record<string, unknown> = {}, repository = 'RealXKenny/Arrakis-Control-Bot') => ({
  action: 'published',
  repository: { full_name: repository },
  release: { tag_name: 'v2.0.3', draft: false, prerelease: false, published_at: '2026-11-27T03:00:00Z', ...overrides },
});

const signal = async (module: Awaited<ReturnType<typeof load>>) =>
  (await (await module.releaseSignal(new Request('https://dash.example.test/api/v2/updates/signal'))).json()) as {
    releases: Record<string, { version: string; prerelease: boolean }>;
  };

beforeEach(() => {
  delete (globalThis as { arrakisReleaseSignal?: unknown }).arrakisReleaseSignal;
});
afterEach(() => vi.unstubAllEnvs());

describe('release webhook', () => {
  it('is off until a secret is configured', async () => {
    const module = await load();
    expect((await module.releaseWebhook(delivery(release()))).status).toBe(404);
  });

  it('records a verified release of either app and serves it as the signal', async () => {
    vi.stubEnv('UPDATE_WEBHOOK_SECRET', SECRET);
    const module = await load();
    expect((await module.releaseWebhook(delivery(release()))).status).toBe(200);
    expect(
      (await module.releaseWebhook(delivery(release({ tag_name: 'v2.1.0' }, 'realxkenny/arrakis-control-dashboard'))))
        .status,
    ).toBe(200);
    const { releases } = await signal(module);
    expect(releases['RealXKenny/Arrakis-Control-Bot']).toMatchObject({ version: '2.0.3', prerelease: false });
    expect(releases['RealXKenny/Arrakis-Control-Dashboard']).toMatchObject({ version: '2.1.0' });
  });

  it('rejects a missing or wrong signature before reading the payload', async () => {
    vi.stubEnv('UPDATE_WEBHOOK_SECRET', SECRET);
    const module = await load();
    expect(
      (await module.releaseWebhook(delivery(release(), { secret: 'another-secret-another-secret-0000' }))).status,
    ).toBe(401);
    expect((await module.releaseWebhook(delivery(release(), { signature: 'sha256=zz' }))).status).toBe(401);
    expect((await module.releaseWebhook(delivery(release(), { signature: '' }))).status).toBe(401);
    expect((await signal(module)).releases).toEqual({});
  });

  it('ignores drafts, other repositories, other events and malformed tags', async () => {
    vi.stubEnv('UPDATE_WEBHOOK_SECRET', SECRET);
    const module = await load();
    for (const request of [
      delivery(release({ draft: true })),
      delivery(release({}, 'someone/else')),
      delivery(release({ tag_name: 'v2.0.3; rm -rf /' })),
      delivery({ ...release(), action: 'deleted' }),
      delivery(release(), { event: 'push' }),
    ])
      expect((await module.releaseWebhook(request)).status).toBe(202);
    expect((await module.releaseWebhook(delivery({ zen: 'hi' }, { event: 'ping' }))).status).toBe(200);
    expect((await signal(module)).releases).toEqual({});
  });

  it('marks release candidates as prereleases', async () => {
    vi.stubEnv('UPDATE_WEBHOOK_SECRET', SECRET);
    const module = await load();
    await module.releaseWebhook(delivery({ ...release({ tag_name: 'v2.1.0-rc.1' }), action: 'prereleased' }));
    expect((await signal(module)).releases['RealXKenny/Arrakis-Control-Bot']).toMatchObject({
      version: '2.1.0-rc.1',
      prerelease: true,
    });
  });
});
