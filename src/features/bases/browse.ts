import { z } from 'zod';
import { BASE_PAGE_SIZE, type BaseSummary } from './schema';

export const BASE_SORTS = ['newest', 'pieces'] as const;

const queryShape = z.object({
  q: z.string().trim().max(128).catch(''),
  map: z.string().trim().max(80).catch(''),
  sort: z.enum(BASE_SORTS).catch('newest'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type BaseQuery = z.infer<typeof queryShape>;

type SearchParams = Record<string, string | string[] | undefined>;

export function parseBaseQuery(params: SearchParams): BaseQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return queryShape.parse({
    q: first(params.q) ?? '',
    map: first(params.map) ?? '',
    sort: first(params.sort),
    page: first(params.page) ?? 1,
  });
}

export function baseBrowseHref(query: BaseQuery, overrides: Partial<BaseQuery> = {}): string {
  const next = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.map) params.set('map', next.map);
  if (next.sort !== 'newest') params.set('sort', next.sort);
  if (next.page > 1) params.set('page', String(next.page));
  const search = params.toString();
  return search ? `/bases?${search}` : '/bases';
}

export interface BaseBrowsePage {
  listings: BaseSummary[];
  total: number;
  page: number;
  pageCount: number;
  maps: string[];
}

export function browseBases(all: BaseSummary[], query: BaseQuery): BaseBrowsePage {
  const needle = query.q.toLowerCase();
  const maps = [...new Set(all.map((listing) => listing.map))].sort((a, b) => a.localeCompare(b));
  const matches = all.filter(
    (listing) =>
      (!query.map || listing.map === query.map) &&
      (!needle ||
        [listing.title, listing.author, listing.baseType, listing.map, listing.description ?? '']
          .join('\n')
          .toLowerCase()
          .includes(needle)),
  );
  matches.sort((a, b) =>
    query.sort === 'pieces'
      ? b.pieceCount - a.pieceCount || b.publishedAt.localeCompare(a.publishedAt)
      : b.publishedAt.localeCompare(a.publishedAt),
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / BASE_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  return {
    listings: matches.slice((page - 1) * BASE_PAGE_SIZE, page * BASE_PAGE_SIZE),
    total: matches.length,
    page,
    pageCount,
    maps,
  };
}
