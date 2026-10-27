import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redis } = vi.hoisted(() => ({
  redis: {
    eval: vi.fn(),
    zrange: vi.fn(),
    get: vi.fn(),
  },
}));
vi.mock('../../src/lib/redis', () => ({ getRedisClient: () => redis }));

import { createMarketplaceRecord, parseMarketplaceLayout } from '../../src/modules/marketplace/schema';
import {
  getMarketplaceRecord,
  listMarketplaceSummaries,
  publishMarketplaceRecord,
} from '../../src/modules/marketplace/server/store';

const summaries = new Map<string, string>();
const records = new Map<string, string>();
const members = new Set<string>();

function record(id: string, title: string, publishedAt = '2026-10-27T12:00:00.000Z') {
  return createMarketplaceRecord({
    id,
    title,
    author: 'Author',
    publishedAt,
    layout: {
      name: title,
      base_type: 'Advanced Sub-Fief',
      map: 'Hagga Basin',
      owner_name: 'Private author',
      owner_secret: 'exclude-me',
      instances: [
        { instance_id: 1, building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0, rotation: 0, extra: 'drop' },
      ],
      placeables: [],
      pentashields: [],
    },
  });
}

beforeEach(() => {
  summaries.clear();
  records.clear();
  members.clear();
  redis.eval.mockReset().mockImplementation(async (_script, keys, args) => {
    const [, recordKey, summaryStateKey] = keys;
    const [serializedRecord, summary] = args;
    const previous = summaries.get(summaryStateKey);
    if (previous) members.delete(previous);
    records.set(recordKey, serializedRecord);
    summaries.set(summaryStateKey, summary);
    members.add(summary);
    return 1;
  });
  redis.zrange
    .mockReset()
    .mockImplementation(async (_key, _min, max) => [...members].slice(0, max + 1).map((value) => JSON.parse(value)));
  redis.get.mockReset().mockImplementation(async (key) => {
    const value = records.get(key);
    return value === undefined ? null : JSON.parse(value);
  });
});

describe('Base Marketplace schema and Redis store', () => {
  it('strips private and unknown fields while deriving public counts', () => {
    const shared = record('a'.repeat(24), 'Test base');
    expect(shared.summary.pieceCount).toBe(1);
    expect(shared.summary.placeableCount).toBe(0);
    expect(shared.summary.baseType).toBe('Advanced Sub-Fief');
    expect(shared.summary.map).toBe('Hagga Basin');
    expect(shared.layout.instances[0]).toEqual({
      instance_id: 1,
      building_type: 'Atreides_Outpost_Foundation',
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
    });
    expect(JSON.stringify(shared)).not.toMatch(/owner_name|owner_secret|exclude-me|extra/);
    expect(() => parseMarketplaceLayout({ instances: [], placeables: [] })).toThrow('no building pieces');
  });

  it("updates one listing idempotently without removing another author's summary", async () => {
    const first = record('a'.repeat(24), 'First base', '2026-10-26T12:00:00.000Z');
    const second = record('b'.repeat(24), 'Second base');
    await publishMarketplaceRecord(first);
    await publishMarketplaceRecord(second);
    await publishMarketplaceRecord(record('a'.repeat(24), 'First base revised'));
    const listings = await listMarketplaceSummaries();
    expect(listings).toHaveLength(2);
    expect(listings.map((listing) => listing.title).sort()).toEqual(['First base revised', 'Second base']);
    expect(JSON.stringify(listings)).not.toContain('First base\"');
    expect(records.size).toBe(2);
    expect(summaries.size).toBe(2);
  });

  it('bounds catalog reads and returns validated detail records', async () => {
    await publishMarketplaceRecord(record('a'.repeat(24), 'One'));
    await publishMarketplaceRecord(record('b'.repeat(24), 'Two'));
    await publishMarketplaceRecord(record('c'.repeat(24), 'Three'));
    expect(await listMarketplaceSummaries(2)).toHaveLength(2);
    expect((await getMarketplaceRecord('a'.repeat(24)))?.summary.title).toBe('One');
    expect(await getMarketplaceRecord('not-an-id')).toBeNull();
  });
});
