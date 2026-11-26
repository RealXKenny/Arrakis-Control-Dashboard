'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { formatDecimal } from '../../../lib/format';
import { ACTIVITY_HOURS, type ActivityView, type ProjectComparisonView, type SalesView } from '../planner';
import { ActivityChart } from './market-charts';
import { errorText, formatTime, plannerFetch } from './planner-request';

const RANGE_LABELS: Record<(typeof ACTIVITY_HOURS)[number], string> = { 24: '24 hours', 168: '7 days', 720: '30 days' };
const field =
  'h-11 w-full min-w-0 border border-sand-200/20 bg-obsidian-900 px-3 text-sm font-normal normal-case tracking-normal text-sand-50';
const labelClass = 'grid min-w-0 gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-sand-400';

function coverageText(coverage: { fetched: number; excluded: number; reported: number | null; truncated: boolean }) {
  const parts = [`${coverage.fetched} orders read`];
  if (coverage.reported !== null && coverage.reported !== undefined) parts.push(`${coverage.reported} reported`);
  if (coverage.truncated) parts.push('older orders beyond the read limit are not charted');
  if (coverage.excluded) parts.push(`${coverage.excluded} without a usable time were left out`);
  return parts.join(' · ');
}

/** Hides readings when the page is hidden, so stale private figures are never shown as current. */
function useHiddenReset(reset: () => void) {
  const latest = useRef(reset);
  useEffect(() => {
    latest.current = reset;
  });
  useEffect(() => {
    const hide = () => {
      if (document.hidden) latest.current();
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
}

export function MarketInsights() {
  const [activity, setActivity] = useState<ActivityView | null>(null);
  const [sales, setSales] = useState<SalesView | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  useHiddenReset(() => {
    current.current?.abort();
    setBusy(false);
    setActivity(null);
    setSales(null);
  });
  useEffect(() => () => current.current?.abort(), []);

  async function run<T>(path: string, apply: (value: T) => void, label: string) {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setMessage(`Loading ${label}…`);
    try {
      const value = await plannerFetch<T>(path, { signal: controller.signal, timeoutMs: 45_000 });
      if (!controller.signal.aborted) {
        apply(value);
        setMessage('');
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(errorText(error, `${label} could not be loaded.`));
    } finally {
      if (current.current === controller) setBusy(false);
    }
  }

  function loadActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams({ hours: String(form.get('hours')) });
    const q = String(form.get('q') ?? '').trim();
    if (q) params.set('q', q);
    setActivity(null);
    void run<ActivityView>(`/api/v2/market/activity?${params}`, setActivity, 'market activity');
  }
  function loadSales(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hours = String(new FormData(event.currentTarget).get('hours'));
    setSales(null);
    void run<SalesView>(`/api/v2/market/sales?hours=${encodeURIComponent(hours)}`, setSales, 'your sales');
  }

  const rangeSelect = (
    <label className={labelClass}>
      Range
      <select name="hours" defaultValue="168" className={field}>
        {ACTIVITY_HOURS.map((hours) => (
          <option key={hours} value={hours}>
            {RANGE_LABELS[hours]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Card as="section" className="panel min-w-0 p-6" aria-labelledby="insights-title">
      <h2 id="insights-title" className="text-base">
        Completed orders
      </h2>
      <p className="mt-2 max-w-prose text-sm text-sand-400">
        Only some Console releases record completed orders, and only from the release that added it. When the Console
        does not support it, this section says so instead of estimating.
      </p>
      <p role="status" className="mt-3 text-sm text-sand-300">
        {message}
      </p>

      <form onSubmit={loadActivity} className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Market activity">
        {rangeSelect}
        <label className={labelClass}>
          Item search (optional)
          <input name="q" maxLength={128} className={field} />
        </label>
        <Button type="submit" className="btn btn-primary self-end" disabled={busy}>
          Show market activity
        </Button>
      </form>
      {activity &&
        (activity.status === 'ok' ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Completed orders per {activity.hours <= 24 ? 'hour' : 'day'}</h3>
            <ActivityChart buckets={activity.buckets} hours={activity.hours} />
            {activity.totals && (
              <p className="mt-2 font-mono text-xs text-sand-300">
                Console totals: {formatDecimal(activity.totals.events)} orders · {formatDecimal(activity.totals.units)}{' '}
                units · {formatDecimal(activity.totals.value)} Solaris
              </p>
            )}
            <p className="mt-1 text-xs text-sand-400">
              {coverageText(activity.coverage)} · read {formatTime(activity.readAt)}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-status-warn">{activity.message}</p>
        ))}

      <h3 className="mt-8 text-sm font-semibold">Your sales</h3>
      <p className="mt-1 max-w-prose text-sm text-sand-400">
        Counted only when a completed order names your freshly verified character as the seller. Names never count.
      </p>
      <form onSubmit={loadSales} className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Your sales">
        {rangeSelect}
        <Button type="submit" className="btn btn-primary self-end" disabled={busy}>
          Show your sales
        </Button>
      </form>
      {sales &&
        (sales.status === 'ok' ? (
          <div className="mt-4 min-w-0">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-sand-400">Sales</dt>
              <dd className="font-mono">{sales.summary.sales}</dd>
              <dt className="text-sand-400">Units sold</dt>
              <dd className="font-mono">{formatDecimal(sales.summary.units)}</dd>
              <dt className="text-sand-400">Value</dt>
              <dd className="font-mono">
                {formatDecimal(sales.summary.value)}
                {sales.summary.incomplete > 0 && ` (${sales.summary.incomplete} sales without complete totals)`}
              </dd>
            </dl>
            {sales.summary.items.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <caption className="sr-only">Sales by item</caption>
                  <thead>
                    <tr className="text-sand-500">
                      <th className="py-1 pr-3 font-normal">Item</th>
                      <th className="py-1 pr-3 font-normal">Sales</th>
                      <th className="py-1 pr-3 font-normal">Units</th>
                      <th className="py-1 font-normal">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.summary.items.map((item) => (
                      <tr key={item.templateId ?? item.name ?? 'unknown'}>
                        <td className="py-1 pr-3">{item.name ?? item.templateId ?? 'Unknown item'}</td>
                        <td className="py-1 pr-3">{item.sales}</td>
                        <td className="py-1 pr-3">{formatDecimal(item.units)}</td>
                        <td className="py-1">{formatDecimal(item.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-sand-400">
              {coverageText(sales.coverage)}
              {sales.coverage.unattributed > 0 && ` · ${sales.coverage.unattributed} orders had no seller ID`} · read{' '}
              {formatTime(sales.readAt)}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-status-warn">{sales.message}</p>
        ))}
    </Card>
  );
}

/** N046: owned versus needed for one saved project. Storage reads reuse the item finder's permission checks. */
export function ProjectComparison({ projectId }: { projectId: string }) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; view: ProjectComparisonView }
  >({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useHiddenReset(() => setState({ status: 'error', message: 'Comparison cleared while the page was hidden.' }));
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    plannerFetch<ProjectComparisonView>(`/api/v2/market/planner/projects/${encodeURIComponent(projectId)}`, {
      signal: controller.signal,
      timeoutMs: 60_000,
    })
      .then((view) => {
        if (!controller.signal.aborted) setState({ status: 'ok', view });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ status: 'error', message: errorText(error, 'The comparison could not be loaded.') });
      });
    return () => controller.abort();
  }, [projectId, attempt]);

  if (state.status === 'loading')
    return <p className="mt-3 text-sm text-sand-400">Checking your authorized storage…</p>;
  if (state.status === 'error')
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-sand-400">
        <span>{state.message}</span>
        <Button type="button" className="btn btn-ghost" onClick={() => setAttempt((value) => value + 1)}>
          Try again
        </Button>
      </div>
    );
  const { materials, coverage } = state.view;
  const failed = coverage.sources.filter((source) => source.status !== 'ok');
  return (
    <div className="mt-3 min-w-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <caption className="sr-only">Materials owned versus needed</caption>
          <thead>
            <tr className="text-sand-500">
              <th className="py-1 pr-3 font-normal">Material</th>
              <th className="py-1 pr-3 font-normal">Needed</th>
              <th className="py-1 pr-3 font-normal">Owned</th>
              <th className="py-1 pr-3 font-normal">To buy</th>
              <th className="py-1 font-normal">Listed cost</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((material) => (
              <tr key={material.templateId}>
                <td className="py-1 pr-3">{material.name}</td>
                <td className="py-1 pr-3">{formatDecimal(material.needed)}</td>
                <td className="py-1 pr-3">
                  {formatDecimal(material.owned)}
                  {!material.ownedComplete && ' or more'}
                </td>
                <td className="py-1 pr-3">
                  {formatDecimal(material.toBuy)}
                  {!material.ownedComplete && material.toBuy !== '0' && ' at most'}
                </td>
                <td className="py-1">
                  {material.toBuy === '0'
                    ? '—'
                    : material.estimate
                      ? `${formatDecimal(material.estimate.cost)}${material.estimate.shortfall !== '0' ? ` (short ${formatDecimal(material.estimate.shortfall)})` : ''}`
                      : 'Unknown'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-sand-400">
        Storage checked {formatTime(coverage.startedAt)}.
        {coverage.limited && ' The scan reached its limit, so owned counts are lower bounds.'}
        {failed.length > 0 && ` Unavailable sources: ${failed.map((source) => source.name).join(', ')}.`}
      </p>
    </div>
  );
}
