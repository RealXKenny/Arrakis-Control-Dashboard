import Link from 'next/link';
import type { PortalBase } from '../../../../features/portal/view-model';
import { Meter } from '../../_components/meter';

export function HoldingCard({ base }: { base: PortalBase }) {
  return (
    <article className={`panel flex flex-col gap-5 p-5 ${base.owned ? 'border-spice-500/30' : ''}`}>
      <header className="flex items-start justify-between gap-3 border-b border-sand-200/10 pb-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm tracking-wide" title={base.name}>
            {base.name}
          </h3>
          <p
            className="mt-1 truncate font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500"
            title={base.type}
          >
            {base.type}
          </p>
        </div>
        <span
          className={`shrink-0 border px-2 py-1 font-mono text-[0.625rem] font-semibold uppercase tracking-widest ${
            base.owned ? 'border-spice-500/50 text-spice-300' : 'border-sand-200/20 text-sand-400'
          }`}
        >
          {base.owned ? 'Owned' : 'Shared'}
        </span>
      </header>

      <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
        Owner <span className="ml-2 text-sand-200">{base.owner}</span>
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Meter label="Runtime" percent={base.runtime.percent} value={base.runtime.text} />
        <Meter label="Water" percent={base.water.percent} value={base.water.text} tone="water" />
        <Meter label="Storage" percent={base.storage.percent} value={base.storage.text} fullIsBad />
      </div>

      {base.telemetryGap && (
        <p className="border-t border-sand-200/10 pt-3 text-xs text-sand-500">
          Telemetry unavailable for one or more systems.
        </p>
      )}

      {base.owned && (
        <div className="flex flex-wrap gap-3 border-t border-sand-200/10 pt-4">
          <a
            href={`/api/bases/${encodeURIComponent(base.id)}/export`}
            download
            className="btn btn-ghost min-h-9 px-4 text-[0.6875rem]"
          >
            Download blueprint
          </a>
          <Link href="/bases/upload" className="btn btn-ghost min-h-9 px-4 text-[0.6875rem]">
            Share to marketplace
          </Link>
        </div>
      )}
    </article>
  );
}
