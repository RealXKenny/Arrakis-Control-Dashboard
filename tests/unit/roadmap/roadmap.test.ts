import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  LOG_LEVEL: 'FATAL',
  NODE_ENV: 'test',
  ROADMAP_REPOSITORIES: 'RealXKenny/Arrakis-Control-Dashboard,RealXKenny/Arrakis-Control-Bot',
  ROADMAP_LABEL: 'roadmap',
  ROADMAP_REFRESH_SECONDS: 1200,
  ROADMAP_GITHUB_TOKEN: undefined as string | undefined,
}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => env }));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));

import { resetSharedCacheForTests } from '../../../src/lib/cache/shared-cache';
import { readRoadmap, summarize, toEntry } from '../../../src/features/roadmap/server/roadmap';
import { compareVersions, filterRoadmap, milestones } from '../../../src/features/roadmap/model';

const DASH = 'RealXKenny/Arrakis-Control-Dashboard';
const issue = (overrides: Record<string, unknown> = {}) => ({
  number: 7,
  title: 'Dungeon leaderboard',
  html_url: `https://github.com/${DASH}/issues/7`,
  state: 'open',
  state_reason: null,
  labels: [{ name: 'roadmap' }, { name: 'status: in progress' }],
  milestone: { title: '2.1.0', due_on: null },
  body: 'Fastest runs per dungeon.\n\nInternal notes below.',
  updated_at: '2026-11-20T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  resetSharedCacheForTests();
  vi.unstubAllGlobals();
  env.ROADMAP_GITHUB_TOKEN = undefined;
});

describe('roadmap entries', () => {
  it('maps approved issues to status, category and confirmed target version', () => {
    expect(toEntry(issue(), DASH, 'roadmap')).toMatchObject({
      status: 'in-progress',
      category: 'dashboard',
      targetVersion: '2.1.0',
      summary: 'Fastest runs per dungeon.',
    });
    expect(toEntry(issue({ labels: ['roadmap', 'area: bot'] }), DASH, 'roadmap')?.category).toBe('bot');
    expect(toEntry(issue({ milestone: { title: 'Someday' } }), DASH, 'roadmap')?.targetVersion).toBeNull();
  });

  it('never shows unapproved, security, private, internal or pull-request items', () => {
    expect(toEntry(issue({ labels: [{ name: 'status: planned' }] }), DASH, 'roadmap')).toBeNull();
    for (const label of ['security', 'Vulnerability', 'private', 'internal', 'confidential'])
      expect(toEntry(issue({ labels: ['roadmap', label] }), DASH, 'roadmap')).toBeNull();
    expect(toEntry(issue({ pull_request: {} }), DASH, 'roadmap')).toBeNull();
    expect(toEntry(issue({ html_url: 'https://evil.test/x' }), DASH, 'roadmap')).toBeNull();
  });

  it('marks only completed closures as released and drops not-planned ones', () => {
    expect(
      toEntry(issue({ state: 'closed', state_reason: 'completed', labels: ['roadmap'] }), DASH, 'roadmap')?.status,
    ).toBe('released');
    expect(toEntry(issue({ state: 'closed', state_reason: 'not_planned' }), DASH, 'roadmap')).toBeNull();
    expect(toEntry(issue({ labels: ['roadmap'] }), DASH, 'roadmap')?.status).toBe('planned');
  });

  it('reduces issue bodies to plain text without HTML, comments or code', () => {
    expect(summarize('<!-- secret -->\n<script>x</script>**Bold** [link](https://x.test) `code`')).toBe(
      'Bold link code',
    );
    expect(summarize('## Context\nignored\n\n## Roadmap summary\nShown text.\n\n## Notes\nHidden')).toBe('Shown text.');
    expect(summarize('```\nkey=1\n```\n\nVisible')).toBe('Visible');
    // Removing one block must not assemble another, and no angle bracket survives.
    expect(summarize('<scr<script>x</script>ipt>alert(1)</script> <!<!-- a -->-- b --> Safe')).not.toMatch(/[<>]/);
    expect(summarize('1 < 2')).toBe('1 2');
  });

  it('filters, sorts and groups upcoming milestones', () => {
    const a = toEntry(issue(), DASH, 'roadmap')!;
    const b = toEntry(
      issue({ number: 8, html_url: `https://github.com/${DASH}/issues/8`, labels: ['roadmap', 'status: released'] }),
      DASH,
      'roadmap',
    )!;
    expect(filterRoadmap([b, a], { query: '', status: null, category: null })[0]).toBe(a);
    expect(filterRoadmap([a, b], { query: '', status: 'released', category: null })).toEqual([b]);
    expect(milestones([a, b])).toEqual([{ version: '2.1.0', dueOn: null, count: 1 }]);
    expect(compareVersions('2.10.0', '2.9.0')).toBeGreaterThan(0);
    expect(compareVersions(null, '1.0.0')).toBeGreaterThan(0);
  });
});

describe('roadmap synchronisation', () => {
  it('reads each repository once, sends no token by default and serves visitors from cache', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async (url: string) =>
        Response.json(url.includes('Bot') ? [] : [issue()], { headers: { etag: '"v1"' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    const first = await readRoadmap();
    await readRoadmap();
    expect(first.data.entries).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(JSON.stringify(first.data)).not.toContain('etag');
  });

  it('uses conditional requests and keeps the cached copy through a GitHub outage', async () => {
    env.ROADMAP_GITHUB_TOKEN = 'github_pat_test_token_value_123';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => Response.json([issue()], { headers: { etag: '"v1"' } })),
    );
    const first = await readRoadmap();
    const conditional = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"v1"');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer github_pat_test_token_value_123');
      return new Response(null, { status: 304 });
    });
    vi.stubGlobal('fetch', conditional);
    const { readShared } = await import('../../../src/lib/cache/shared-cache');
    expect(readShared).toBeTypeOf('function');
    resetSharedCacheForTests();
    // Memory was cleared, so this is a miss; the stored reading is gone too (no Redis), so it fetches fresh.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: 'API rate limit exceeded' },
            { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
          ),
        ),
    );
    await expect(readRoadmap()).rejects.toThrow();
    expect(first.data.entries[0].status).toBe('in-progress');
  });
});
