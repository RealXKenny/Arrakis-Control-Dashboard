'use client';
import Link from 'next/link';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { buildCareInbox } from '../care';
import { DEFAULT_WATER_ALERT_PERCENT, type UpkeepView } from '../model';
import { useUpkeep } from './use-upkeep';
import { WaterChart } from './water-chart';
import { BasePlans } from './base-plans';
import { Reminders } from './reminders';
import { Blueprints } from './blueprints';
import { Relocations } from './relocations';

const tone = {
  urgent: 'border-l-status-danger',
  attention: 'border-l-status-warn',
  unknown: 'border-l-sand-400',
} as const;

export function Upkeep({ view }: { view: UpkeepView }) {
  const state = useUpkeep();
  const { record, overview, message, loading, saving, load } = state;
  const bases = overview?.bases ?? [];
  const items =
    record && overview?.status === 'ok' ? buildCareInbox(bases, record, state.now, overview.observedAt ?? null) : [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button type="button" className="btn btn-ghost" disabled={loading || saving} onClick={() => void load()}>
          Refresh readings
        </Button>
        {overview?.observedAt && (
          <p className="font-mono text-xs text-sand-400">Observed {new Date(overview.observedAt).toLocaleString()}</p>
        )}
      </div>
      <p role="status" className="mb-4 min-h-5 break-words text-sm text-sand-300">
        {message}
      </p>
      {overview?.status === 'ok' && (overview.limited || (overview.unsupported ?? 0) > 0) && (
        <p className="mb-4 text-sm text-status-warn">
          Coverage is partial: at most 20 bases are checked
          {overview.unsupported
            ? `, and ${overview.unsupported} base(s) without a supported identifier were skipped`
            : ''}
          .
        </p>
      )}
      {record && view === 'care' && (
        <>
          <Card as="section" className="panel mb-6 min-w-0 p-6" aria-labelledby="care-title">
            <h2 id="care-title" className="text-base">
              Base-care inbox
            </h2>
            <p className="mt-2 text-sm text-sand-400">
              Upkeep warnings for the bases your linked character can currently inspect, using your own alert levels.
              Unknown readings are listed instead of being treated as healthy. Nothing here performs a game action.
            </p>
            {overview?.status === 'ok' && !items.length && (
              <p className="mt-4 text-sm">No upkeep warnings for the readings checked.</p>
            )}
            <ul className="mt-4 grid gap-3" aria-label="Base-care warnings">
              {items.map((item) => (
                <li key={item.id} className={`min-w-0 border border-l-4 border-sand-200/20 p-4 ${tone[item.priority]}`}>
                  <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
                    {item.priority === 'unknown' ? 'Unknown reading' : item.priority}
                    {item.estimate ? ' · includes an estimate' : ''}
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold text-sand-50">{item.title}</p>
                  <p className="mt-1 break-words text-sm text-sand-300">{item.detail}</p>
                  <Link href={item.href} className="mt-2 inline-block text-sm text-spice-300 underline">
                    {item.kind === 'reminder'
                      ? 'Open reminders'
                      : item.kind === 'inspection'
                        ? 'Open checklist'
                        : 'Inspect base'}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card as="section" className="panel mb-6 min-w-0 p-6" aria-labelledby="water-title">
            <h2 id="water-title" className="text-base">
              Observed water usage
            </h2>
            <p className="mt-2 text-sm text-sand-400">
              A sample is kept at most every ten minutes, only when you open this page. Usage rates are estimates from
              those samples and are not reported by the game.
            </p>
            <ul className="mt-4 grid gap-5 xl:grid-cols-2">
              {bases.map((base) => {
                const series = overview?.water?.find((entry) => entry.baseId === base.id);
                const threshold =
                  record.bases.find((entry) => entry.baseId === base.id)?.waterAlertPercent ??
                  DEFAULT_WATER_ALERT_PERCENT;
                return (
                  <li key={base.id} className="min-w-0 border border-sand-200/20 p-4">
                    <p className="break-words text-sm font-semibold">{base.name}</p>
                    {!series?.samples || !series.analysis ? (
                      <p className="mt-2 text-sm text-status-warn">Sample history is unavailable right now.</p>
                    ) : series.samples.length < 2 ? (
                      <p className="mt-2 text-sm text-sand-400">
                        {series.samples.length} sample recorded. Open this page again later to build a history.
                      </p>
                    ) : (
                      <WaterChart
                        name={base.name}
                        samples={series.samples}
                        analysis={series.analysis}
                        threshold={threshold}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
      {record && view === 'bases' && <BasePlans state={state} bases={bases} />}
      {record && view === 'reminders' && <Reminders state={state} bases={bases} />}
      {record && view === 'blueprints' && <Blueprints state={state} />}
      {record && view === 'relocation' && <Relocations state={state} bases={bases} />}
    </>
  );
}
