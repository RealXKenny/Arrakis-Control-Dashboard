import '../../../lib/assert-server';
import { DuneConsoleApiError, getDuneClient } from '../../../server/integrations/dune';
import { ReadCache } from '../../../lib/cache/read-cache';
import { logger } from '../../../lib/logger';
import { record, rows, type DataRow } from '../../player/inventory';
import type { Trade } from '../planner';

/**
 * Completed-order history (`GET /api/exchange/transactions`). Only some Console releases provide it, and only from
 * the release that introduced it forward, so every reading reports support and coverage explicitly.
 */
const PAGE_SIZE = 100;
const TRADE_PAGE_LIMIT = 5;

export interface TradeCoverage {
  fetched: number;
  /** Rows without a usable timestamp; they are excluded rather than guessed. */
  excluded: number;
  reported: number | null;
  truncated: boolean;
  /** Whether any row carries an explicit seller ID field. Without one, sales cannot be attributed. */
  sellerIds: boolean;
}
export type TradeReading =
  | { status: 'ok'; trades: Trade[]; coverage: TradeCoverage; totals: TradeTotals | null; readAt: string }
  | { status: 'unsupported' | 'denied' | 'unavailable'; message: string; readAt: string };
export interface TradeTotals {
  events: string | null;
  units: string | null;
  value: string | null;
}

const WHOLE = /^(0|[1-9][0-9]{0,29})$/;
function whole(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === 'string' && WHOLE.test(value.trim()) ? value.trim() : null;
}
function text(value: unknown, max = 128): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}
function identifier(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value.trim()) ? value.trim() : null;
}
function timestamp(row: DataRow): string | null {
  for (const value of [row.completed_at, row.completedAt, row.created_at, row.createdAt, row.timestamp, row.time]) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const at = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
    if (Number.isFinite(at) && at > 0) return new Date(at).toISOString();
  }
  return null;
}
const SELLER_FIELDS = ['seller_id', 'sellerId', 'seller_owner_id', 'sellerOwnerId'] as const;

export function normalizeTrade(row: DataRow): Trade | null {
  const at = timestamp(row);
  if (!at) return null;
  const units = whole(row.quantity ?? row.units ?? row.amount ?? row.count);
  const unitPrice = whole(row.price ?? row.unit_price ?? row.item_price);
  const total = whole(row.total_price ?? row.totalPrice ?? row.total ?? row.value);
  const value = total ?? (units !== null && unitPrice !== null ? (BigInt(units) * BigInt(unitPrice)).toString() : null);
  const sellerField = SELLER_FIELDS.find((field) => Object.hasOwn(row, field));
  return {
    at,
    templateId: text(row.template_id ?? row.templateId),
    name: text(row.display_name ?? row.item_name ?? row.name, 200),
    units,
    value,
    sellerId: sellerField ? identifier(row[sellerField]) : null,
  };
}

function totals(raw: DataRow): TradeTotals | null {
  const source = record(raw.totals ?? raw.summary);
  if (!Object.keys(source).length) return null;
  return {
    events: whole(source.events ?? source.count),
    units: whole(source.units ?? source.quantity),
    value: whole(source.value ?? source.total),
  };
}

const trades = new ReadCache<TradeReading>(
  (value) => JSON.stringify(value).length,
  (value) => value.status === 'ok' || value.status === 'unsupported',
  { ttlMs: 60_000, maxEntries: 60 },
);

async function fetchTrades(hours: number, party: 'all' | 'player', q: string): Promise<TradeReading> {
  const readAt = new Date().toISOString();
  const collected: Trade[] = [];
  let fetched = 0;
  let excluded = 0;
  let reported: number | null = null;
  let truncated = false;
  let sellerIds = false;
  let summary: TradeTotals | null = null;
  try {
    for (let page = 0; page < TRADE_PAGE_LIMIT; page += 1) {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        hours: String(hours),
        party,
      });
      if (q) params.set('q', q);
      const raw = await getDuneClient().request('GET', `/api/exchange/transactions?${params}`, { timeoutMs: 10_000 });
      const envelope = record(raw);
      if (envelope.supported === false || record(envelope.capabilities).transactions === false)
        return { status: 'unsupported', message: 'This Console does not record completed orders.', readAt };
      const list = rows(raw);
      if (!list) return { status: 'unavailable', message: 'Completed orders came back in an unknown format.', readAt };
      if (page === 0) {
        const count = Number(envelope.totalCount ?? envelope.total);
        reported = Number.isSafeInteger(count) && count >= 0 ? count : null;
        summary = totals(envelope);
      }
      for (const row of list.slice(0, PAGE_SIZE)) {
        fetched += 1;
        if (SELLER_FIELDS.some((field) => Object.hasOwn(row, field))) sellerIds = true;
        const trade = normalizeTrade(row);
        if (trade) collected.push(trade);
        else excluded += 1;
      }
      if (list.length < PAGE_SIZE || (reported !== null && fetched >= reported)) break;
      if (page === TRADE_PAGE_LIMIT - 1) truncated = true;
    }
  } catch (error) {
    if (error instanceof DuneConsoleApiError && [404, 405, 501].includes(error.status))
      return { status: 'unsupported', message: 'This Console does not provide completed-order history.', readAt };
    if (error instanceof DuneConsoleApiError && (error.status === 401 || error.status === 403))
      return { status: 'denied', message: 'The dashboard’s Console key cannot read completed orders.', readAt };
    logger.warn('Market transaction read failed', { error: error instanceof Error ? error.name : 'unknown' });
    return { status: 'unavailable', message: 'Completed orders are unavailable right now.', readAt };
  }
  return {
    status: 'ok',
    trades: collected,
    coverage: { fetched, excluded, reported, truncated, sellerIds },
    totals: summary,
    readAt,
  };
}

export async function readTrades(hours: number, party: 'all' | 'player', q = ''): Promise<TradeReading> {
  const entry = await trades.get(`${hours}:${party}:${q.toLowerCase()}`, () => fetchTrades(hours, party, q));
  return entry.data;
}
