import { z } from 'zod';
import { toDecimalString } from '../format';

/**
 * Market Grid contract: a strict 5 x 5 board, 25 listings per page.
 * Intelligence and buyback data are intentionally absent from this model.
 */
export const MARKET_COLUMNS = 5;
export const MARKET_ROWS = 5;
export const MARKET_PAGE_SIZE = MARKET_COLUMNS * MARKET_ROWS;

export const MARKET_SORTS = ['listed', 'price', 'name'] as const;
export const MARKET_OWNERS = ['all', 'mine'] as const;

const queryShape = z.object({
  q: z.string().trim().max(128).catch(''),
  /** 1-based in URLs, because humans count from one. */
  page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
  sort: z.enum(MARKET_SORTS).catch('listed'),
  owner: z.enum(MARKET_OWNERS).catch('all'),
});

export type MarketQuery = z.infer<typeof queryShape>;
export type MarketSort = (typeof MARKET_SORTS)[number];

type SearchParams = Record<string, string | string[] | undefined>;

export function parseMarketQuery(params: SearchParams): MarketQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  // `.catch` makes every field self-healing, so hostile query strings degrade to defaults.
  return queryShape.parse({
    q: first(params.q) ?? '',
    page: first(params.page) ?? 1,
    sort: first(params.sort),
    owner: first(params.owner),
  });
}

export interface MarketItem {
  templateId: string;
  name: string;
  grade: number | null;
  /** Decimal strings: never trust a provider integer to fit a double. */
  listings: string | null;
  units: string | null;
  lowestPrice: string | null;
  image: string | null;
}

export interface MarketPage {
  items: MarketItem[];
  total: number;
  /** 1-based. */
  page: number;
  pageCount: number;
}

const envelope = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  totalCount: z.union([z.string(), z.number()]).nullish(),
});

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200);
  }
  return '';
}

function pickGrade(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') continue;
    const number = Number(value);
    if (Number.isInteger(number) && number >= 0 && number <= 99) return number;
  }
  return null;
}

/** Returns null when the provider payload is not a recognisable listing page. */
export function normalizeMarketPage(
  raw: unknown,
  query: Pick<MarketQuery, 'page'>,
  resolveImage: (row: Record<string, unknown>) => string | null = () => null,
): MarketPage | null {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) return null;

  // Dev note: the grid holds 25 items; the 26th waits patiently on page two, like a good Fremen.
  const rows = parsed.data.rows.slice(0, MARKET_PAGE_SIZE);
  const items: MarketItem[] = rows.map((row) => {
    const templateId = pickText(row.template_id, row.templateId);
    return {
      templateId,
      name: pickText(row.display_name, row.displayName, row.name, templateId) || 'Unknown item',
      grade: pickGrade(row.quality_level, row.qualityLevel, row.quality),
      listings: toDecimalString(row.listing_count ?? row.listings),
      units: toDecimalString(row.total_stock ?? row.stock),
      lowestPrice: toDecimalString(row.lowest_price ?? row.lowestPrice),
      image: resolveImage(row),
    };
  });

  const reported = Number(parsed.data.totalCount);
  const total = Number.isSafeInteger(reported) && reported >= 0 ? reported : items.length;
  return { items, total, page: query.page, pageCount: Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE)) };
}

/** Build a market URL, dropping defaults so links stay short and canonical. */
export function marketHref(query: MarketQuery, overrides: Partial<MarketQuery> = {}): string {
  const next = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.sort !== 'listed') params.set('sort', next.sort);
  if (next.owner !== 'all') params.set('owner', next.owner);
  if (next.page > 1) params.set('page', String(next.page));
  const search = params.toString();
  return search ? `/market?${search}` : '/market';
}
