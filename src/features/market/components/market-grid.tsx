import Image from 'next/image';
import { formatDecimal } from '../../../lib/format';
import { MARKET_COLUMNS, MARKET_PAGE_SIZE, type MarketItem } from '../normalize';

function Tile({ item }: { item: MarketItem }) {
  return (
    <li className="panel panel-interactive flex min-h-44 flex-col gap-3 p-3">
      <div className="flex h-14 items-center justify-center bg-obsidian-950/60">
        {item.image ? (
          <Image src={item.image} alt="" width={48} height={48} unoptimized className="size-12 object-contain" />
        ) : (
          <span aria-hidden="true" className="font-mono text-xs text-sand-600">
            N/A
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-xs font-bold uppercase leading-snug tracking-wide text-sand-50" title={item.name}>
        {item.name}
      </p>
      <dl className="mt-auto grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[0.6875rem]">
        <dt className="text-sand-500">Ask</dt>
        <dd className="text-right font-semibold text-spice-400">{formatDecimal(item.lowestPrice)}</dd>
        <dt className="text-sand-500">Units</dt>
        <dd className="text-right text-sand-300">{formatDecimal(item.units)}</dd>
        <dt className="text-sand-500">Orders</dt>
        <dd className="text-right text-sand-300">{formatDecimal(item.listings)}</dd>
      </dl>
      {item.grade !== null && (
        <span className="absolute right-2 top-2 border border-spice-500/50 bg-obsidian-950/80 px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold text-spice-300">
          G{item.grade}
        </span>
      )}
    </li>
  );
}

/**
 * Strict 5 x 5 board. It always renders 25 cells (empty slots included) and never reflows
 * to fewer columns: on narrow screens the board scrolls sideways instead of breaking the layout.
 */
export function MarketGrid({ items }: { items: MarketItem[] }) {
  const empty = Math.max(0, MARKET_PAGE_SIZE - items.length);
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      <ul
        aria-label="Market listings"
        className="grid min-w-[44rem] gap-3"
        style={{ gridTemplateColumns: `repeat(${MARKET_COLUMNS}, minmax(0, 1fr))` }}
      >
        {items.map((item, index) => (
          <Tile key={`${item.templateId}:${item.grade ?? 'x'}:${index}`} item={item} />
        ))}
        {Array.from({ length: empty }, (_, index) => (
          <li key={`empty-${index}`} aria-hidden="true" className="min-h-44 border border-dashed border-sand-200/10" />
        ))}
      </ul>
    </div>
  );
}
