import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { toDecimalString } from '../../../lib/format';
import { rows } from '../../player/inventory';
import { getDuneClient } from '../../../server/integrations/dune';
import type { MaterialEstimate } from '../projects';

const MAX_ROWS = 500;
const whole = (value: unknown) => {
  const decimal = toDecimalString(value);
  return decimal && /^(0|[1-9]\d{0,17})$/.test(decimal) ? decimal : null;
};

/**
 * N060 observed estimate: the lowest listed per-unit asking price among in-stock exchange listings.
 * Seller identities are never read into the result. Rows without a whole price or stock are ignored, and
 * a capped or partly unreadable page is flagged as partial rather than presented as the whole market.
 */
export function estimateFromListings(payload: unknown, observedAt: string): MaterialEstimate | null {
  const list = rows(payload);
  if (!list) return null;
  let lowest: bigint | null = null;
  let stock = 0n;
  let counted = 0;
  let skipped = 0;
  for (const row of list.slice(0, MAX_ROWS)) {
    const price = whole(row.item_price ?? row.itemPrice ?? row.price);
    const units = whole(row.stock ?? row.quantity);
    if (!price || !units) {
      skipped += 1;
      continue;
    }
    if (units === '0') continue;
    counted += 1;
    stock += BigInt(units);
    if (lowest === null || BigInt(price) < lowest) lowest = BigInt(price);
  }
  return {
    unitPrice: lowest === null ? null : lowest.toString(),
    listingCount: counted,
    stock: stock > 999_999_999_999_999_999n ? '999999999999999999' : stock.toString(),
    partial: list.length > MAX_ROWS || skipped > 0,
    observedAt,
  };
}

export async function observeMaterialPrice(templateId: string): Promise<MaterialEstimate> {
  const params = new URLSearchParams({ templateId, owner: 'all' });
  let payload: unknown;
  try {
    payload = await getDuneClient().request('GET', `/api/exchange/listings?${params}`, {
      retryRead: false,
      timeoutMs: 10_000,
    });
  } catch {
    throw new AppError('Exchange listings could not be read. Try again shortly.', 502, 'MARKET_UNAVAILABLE', true);
  }
  // Dev note: an asking price is a hope with a number on it; we store it as an estimate, never a receipt.
  const estimate = estimateFromListings(payload, new Date().toISOString());
  if (!estimate)
    throw new AppError('The Console did not return readable exchange listings.', 502, 'MARKET_UNAVAILABLE', true);
  return estimate;
}
