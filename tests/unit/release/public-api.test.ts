import { describe, expect, it } from 'vitest';
import { changelogApi, readProjectReleases } from '../../../src/features/changelog/server/public-api';

describe('public changelog API', () => {
  it('separates projects and serves the published dashboard snapshot', async () => {
    const response = await changelogApi(
      new Request('https://example.test/api/v2/changelog/latest?project=dashboard'),
      true,
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe(1);
    expect(body.releases).toHaveLength(1);
    expect(body.releases[0]).toMatchObject({ project: 'dashboard', id: 'dashboard:2.0.1', date: '2026-11-26' });
    expect(body.releases[0].sections.map((section: { title: string }) => section.title)).toEqual([
      'New Features',
      'Improvements',
      'Fixes',
      'Upgrade Notes',
    ]);
  });

  it('orders bot versions and exposes the stable project identity', async () => {
    const response = await changelogApi(new Request('https://example.test/api/v2/changelog?project=bot'));
    const body = await response.json();
    expect(body.releases[0]).toMatchObject({ project: 'bot', id: 'bot:2.0.1', date: '2026-11-26' });
    expect((await readProjectReleases('bot')).length).toBeGreaterThan(1);
  });

  it('rejects invalid, duplicate and unknown parameters', async () => {
    for (const query of ['?project=unknown', '?project=bot&project=dashboard', '?other=bot']) {
      expect((await changelogApi(new Request(`https://example.test/api/v2/changelog${query}`))).status).toBe(400);
    }
    expect((await changelogApi(new Request('https://example.test/api/v2/changelog/latest'), true)).status).toBe(400);
  });
});
