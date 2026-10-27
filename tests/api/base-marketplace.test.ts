import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireOwnedBaseExport, publishMarketplaceRecord, listMarketplaceSummaries, getMarketplaceRecord, getSession } =
  vi.hoisted(() => ({
    requireOwnedBaseExport: vi.fn(),
    publishMarketplaceRecord: vi.fn(),
    listMarketplaceSummaries: vi.fn(),
    getMarketplaceRecord: vi.fn(),
    getSession: vi.fn(),
  }));
vi.mock('../../src/modules/bases/server/owned-export', () => ({ requireOwnedBaseExport }));
vi.mock('../../src/modules/marketplace/server/store', () => ({
  publishMarketplaceRecord,
  listMarketplaceSummaries,
  getMarketplaceRecord,
}));
vi.mock('../../src/lib/session-store', () => ({ getSession }));
vi.mock('../../src/infrastructure/pages-api', async (importOriginal) => ({
  ...(await importOriginal()),
  isSameOriginRequest: () => true,
}));

import { POST } from '../../src/modules/marketplace/server/publish';
import { detail, list } from '../../src/modules/marketplace/server/read';

const summary = {
  id: 'a'.repeat(24),
  title: 'Shared base',
  author: 'Author',
  baseType: 'Advanced Sub-Fief',
  map: 'Hagga Basin',
  pieceCount: 1,
  placeableCount: 0,
  publishedAt: '2026-10-27T12:00:00.000Z',
};
const record = {
  summary,
  layout: {
    name: 'Shared base',
    base_type: 'Advanced Sub-Fief',
    map: 'Hagga Basin',
    instances: [{ instance_id: 1, building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0, rotation: 0 }],
    placeables: [],
    pentashields: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({
    user: { id: 'user', username: 'author' },
    guildId: 'guild',
    roleIds: [],
    expiresAt: Date.now() + 60_000,
  });
  requireOwnedBaseExport.mockResolvedValue({
    blueprint: {
      name: 'Shared base',
      owner_name: 'Author',
      base_type: 'Advanced Sub-Fief',
      map: 'Hagga Basin',
      owner_secret: 'excluded',
      instances: [{ instance_id: 1, building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0, rotation: 0 }],
      placeables: [],
      pentashields: [],
    },
    linkedPlayer: { characterName: 'Author' },
    session: { user: { id: 'user', username: 'author' } },
  });
  publishMarketplaceRecord.mockResolvedValue(undefined);
  listMarketplaceSummaries.mockResolvedValue([summary]);
  getMarketplaceRecord.mockResolvedValue(record);
});

describe('Base Marketplace API handlers', () => {
  it('publishes a server-fetched authorized export without accepting private client JSON', async () => {
    const response = await POST(
      {
        query: { baseId: '6797' },
        headers: { origin: 'https://dashboard.test', host: 'dashboard.test' },
      } as never,
      {} as never,
    );
    expect(response.status).toBe(200);
    expect(requireOwnedBaseExport).toHaveBeenCalledOnce();
    const published = publishMarketplaceRecord.mock.calls[0][0];
    expect(published.summary.id).toMatch(/^[a-f0-9]{24}$/);
    expect(published.summary.pieceCount).toBe(1);
    expect(JSON.stringify(published)).not.toContain('owner_secret');
    expect(JSON.parse(response.body).listing.title).toBe('Shared base');
  });

  it('requires a verified session for catalog reads', async () => {
    getSession.mockResolvedValue(null);
    await expect(list({ headers: {} } as never, {} as never)).rejects.toMatchObject({ statusCode: 401 });
    expect(listMarketplaceSummaries).not.toHaveBeenCalled();
  });

  it('returns bounded public summaries and sanitized downloadable layouts', async () => {
    const catalog = await list({ headers: { cookie: 'dashboard_session=test' } } as never, {} as never);
    expect(catalog.status).toBe(200);
    expect(JSON.parse(catalog.body).listings).toEqual([summary]);
    const response = await detail(
      { query: { listingId: summary.id, download: '1' }, headers: { cookie: 'dashboard_session=test' } } as never,
      {} as never,
    );
    expect(response.status).toBe(200);
    expect(response.headers['Content-Disposition']).toBe('attachment; filename="Shared_base.json"');
    expect(String(response.body)).not.toContain('owner_secret');
    expect(JSON.parse(String(response.body)).layout.instances).toHaveLength(1);
  });
});
