import { describe, expect, it } from 'vitest';
import { baseBrowseHref, browseBases, parseBaseQuery } from '../../../src/features/bases/browse';
import { sniffThumbnail } from '../../../src/features/bases/image';
import {
  BaseValidationError,
  BASE_PAGE_SIZE,
  buildBaseRecord,
  parseLayoutJson,
  pieceBreakdown,
  summarySchema,
  type BaseSummary,
} from '../../../src/features/bases/schema';
import { readBoundedBody } from '../../../src/lib/http/bounded-body';

const layout = {
  name: 'Fort Dune',
  map: 'Hagga Basin',
  base_type: 'Fortress',
  instances: [
    { building_type: 'BP_Wall_Sandstone', x: 0, y: 0, z: 0 },
    { building_type: 'BP_Wall_Sandstone', x: 1, y: 0, z: 0 },
  ],
  placeables: [{ building_type: 'BP_Lamp', x: 0, y: 0, z: 1 }],
};

function record(overrides: Partial<Parameters<typeof buildBaseRecord>[0]> = {}) {
  return buildBaseRecord({
    id: 'a'.repeat(24),
    title: 'Fort Dune',
    author: 'Paul',
    layout: parseLayoutJson(JSON.stringify(layout)),
    ownerKey: 'b'.repeat(16),
    hasThumbnail: false,
    publishedAt: '2026-11-07T00:00:00.000Z',
    ...overrides,
  });
}

describe('V2 base upload validation', () => {
  it('accepts a layout and a full record (download round trip)', () => {
    const made = record();
    expect(made.summary).toMatchObject({ pieceCount: 3, placeableCount: 1, map: 'Hagga Basin' });
    const again = parseLayoutJson(JSON.stringify(made));
    expect(again.instances).toHaveLength(2);
  });

  it('rejects bad JSON, wrong shapes, empty bases and oversize files with friendly errors', () => {
    expect(() => parseLayoutJson('{nope')).toThrow(/not valid JSON/);
    expect(() => parseLayoutJson(JSON.stringify({ instances: [{ building_type: 'x' }] }))).toThrow(BaseValidationError);
    expect(() => parseLayoutJson(JSON.stringify({ instances: [], placeables: [] }))).toThrow(/no building pieces/);
    expect(() => parseLayoutJson(' '.repeat(2 * 1024 * 1024 + 1))).toThrow(/2 MiB/);
  });

  it('keeps the publisher private: summaries only ever hold a hashed owner key', () => {
    expect(summarySchema.safeParse({ ...record().summary, ownerKey: '123456789012345678' }).success).toBe(false);
  });

  it('summarises composition by building type', () => {
    expect(pieceBreakdown(parseLayoutJson(JSON.stringify(layout)))).toEqual([
      { type: 'BP_Wall_Sandstone', count: 2 },
      { type: 'BP_Lamp', count: 1 },
    ]);
  });
});

describe('V2 base browsing', () => {
  const summaries: BaseSummary[] = Array.from({ length: 30 }, (_, i) => ({
    ...record().summary,
    id: i.toString(16).padStart(24, '0'),
    title: i % 2 ? `Outpost ${i}` : `Fortress ${i}`,
    map: i % 3 ? 'Hagga Basin' : 'Deep Desert',
    pieceCount: i + 1,
    publishedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  }));

  it('filters, sorts and paginates', () => {
    const page = browseBases(summaries, parseBaseQuery({ q: 'outpost', sort: 'pieces' }));
    expect(page.total).toBe(15);
    expect(page.listings).toHaveLength(BASE_PAGE_SIZE);
    expect(page.listings[0].pieceCount).toBeGreaterThan(page.listings[1].pieceCount);
    expect(page.maps).toEqual(['Deep Desert', 'Hagga Basin']);
  });

  it('clamps out-of-range pages and heals hostile queries', () => {
    expect(browseBases(summaries, parseBaseQuery({ page: '999' })).page).toBe(3);
    expect(parseBaseQuery({ sort: 'x', page: '-1', q: 'y'.repeat(500) })).toEqual({
      q: '',
      map: '',
      sort: 'newest',
      page: 1,
    });
    expect(baseBrowseHref(parseBaseQuery({ q: 'a', page: '2' }))).toBe('/bases?q=a&page=2');
  });
});

describe('V2 upload safety helpers', () => {
  it('identifies images by magic bytes, not by name', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    expect(sniffThumbnail(png)).toBe('image/png');
    expect(sniffThumbnail(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffThumbnail(new TextEncoder().encode('<script>alert(1)</script>'))).toBeNull();
  });

  it('refuses bodies over the limit even when Content-Length lies', async () => {
    const big = new Request('http://localhost/', { method: 'POST', body: new Uint8Array(2000) });
    expect(await readBoundedBody(big, 1000)).toBeNull();
    const small = new Request('http://localhost/', { method: 'POST', body: new Uint8Array(500) });
    expect((await readBoundedBody(small, 1000))?.length).toBe(500);
  });
});
