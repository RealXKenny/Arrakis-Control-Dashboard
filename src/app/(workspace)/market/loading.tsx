import { MARKET_COLUMNS, MARKET_PAGE_SIZE } from '../../../features/market/normalize';

export default function MarketLoading() {
  return (
    <div aria-busy="true" aria-label="Loading market">
      <div className="mb-10 h-16 w-64 animate-pulse bg-sand-100/5" />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        <ul
          className="grid min-w-[44rem] gap-3"
          style={{ gridTemplateColumns: `repeat(${MARKET_COLUMNS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: MARKET_PAGE_SIZE }, (_, index) => (
            <li key={index} className="min-h-44 animate-pulse border border-sand-200/10 bg-sand-100/[0.03]" />
          ))}
        </ul>
      </div>
    </div>
  );
}
