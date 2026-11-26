'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { formatDecimal } from '../../../lib/format';
import { MARKET_OWNERS, MARKET_SORTS, marketHref } from '../normalize';
import {
  BASKET_LIMIT,
  COOLDOWN_MINUTES,
  FILTER_LIMIT,
  PROJECT_LIMIT,
  PROJECT_MATERIAL_LIMIT,
  WATCH_LIMIT,
  ladderKeyFor,
  plannerRecordSchema,
  type LadderView,
  type Planner,
  type PlannerReadings,
  type PlannerRecord,
} from '../planner';
import { PriceHistory } from './market-charts';
import { MarketInsights, ProjectComparison } from './market-insights';
import { errorText, formatTime, plannerFetch } from './planner-request';

export interface PlannerPrefill {
  templateId: string;
  name: string;
  grade: number | null;
}

const field =
  'h-11 w-full min-w-0 border border-sand-200/20 bg-obsidian-900 px-3 text-sm font-normal normal-case tracking-normal text-sand-50 placeholder:text-sand-600';
const labelClass = 'grid min-w-0 gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-sand-400';
const WHOLE = /^(0|[1-9][0-9]{0,29})$/;
const POSITIVE = /^[1-9][0-9]{0,29}$/;
const SORT_LABELS = { listed: 'Most listed', price: 'Lowest price', name: 'Name' } as const;
const OWNER_LABELS = { all: 'All listings', mine: 'My listings' } as const;
const COOLDOWN_LABELS: Record<(typeof COOLDOWN_MINUTES)[number], string> = {
  15: '15 minutes',
  60: '1 hour',
  240: '4 hours',
  1440: '1 day',
};

const gradeLabel = (grade: number | null | undefined) =>
  grade === null || grade === undefined ? 'Any grade' : `Grade ${grade}`;
const parseGrade = (value: string) => (value === '' ? null : Number(value));
const optionalPrice = (value: string) => (value.trim() === '' ? null : value.trim());

function LadderLine({ ladder }: { ladder: LadderView | undefined }) {
  if (!ladder) return <span className="text-sand-500">Not checked yet</span>;
  if (ladder.status !== 'ok') return <span className="text-status-warn">{ladder.message}</span>;
  const { summary } = ladder;
  if (!summary.orders) return <span className="text-sand-400">No current sell orders</span>;
  return (
    <span>
      Lowest ask <strong className="text-spice-400">{formatDecimal(summary.lowest)}</strong> ·{' '}
      {formatDecimal(summary.stock)} units in {summary.orders} {summary.orders === 1 ? 'order' : 'orders'}
      {(ladder.truncated || ladder.rejected > 0) && (
        <span className="text-status-warn">
          {' '}
          · incomplete ({ladder.truncated ? 'ladder truncated' : `${ladder.rejected} unreadable orders`})
        </span>
      )}
    </span>
  );
}

/** N050: compares the supported listing classifications. Unclassified orders are counted, never guessed. */
function PartyComparison({ ladder }: { ladder: LadderView | undefined }) {
  if (!ladder || ladder.status !== 'ok' || !ladder.summary.orders) return null;
  const { player, broker, unclassified } = ladder.summary;
  const cheaper =
    player.lowest !== null && broker.lowest !== null
      ? BigInt(player.lowest) < BigInt(broker.lowest)
        ? 'Players are cheaper'
        : BigInt(player.lowest) > BigInt(broker.lowest)
          ? 'The broker is cheaper'
          : 'Same lowest ask'
      : null;
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
      <dt className="text-sand-500">Players</dt>
      <dd>{player.orders ? `${formatDecimal(player.lowest)} · ${formatDecimal(player.stock)} units` : 'No orders'}</dd>
      <dt className="text-sand-500">Broker</dt>
      <dd>{broker.orders ? `${formatDecimal(broker.lowest)} · ${formatDecimal(broker.stock)} units` : 'No orders'}</dd>
      {unclassified > 0 && (
        <>
          <dt className="text-sand-500">Unclassified</dt>
          <dd>{unclassified} orders the Console did not label</dd>
        </>
      )}
      {cheaper && (
        <>
          <dt className="text-sand-500">Compare</dt>
          <dd>{cheaper}</dd>
        </>
      )}
    </dl>
  );
}

const ALERT_TEXT = {
  below: 'At or below your low threshold',
  above: 'At or above your high threshold',
  within: 'Within your thresholds',
  unknown: 'Unknown: the current ask could not be read completely',
} as const;

export function MarketPlanner({ prefill }: { prefill: PlannerPrefill | null }) {
  const [record, setRecord] = useState<PlannerRecord | null>(null);
  const [searches, setSearches] = useState<string[] | null>(null);
  const [readings, setReadings] = useState<PlannerReadings | null>(null);
  const [message, setMessage] = useState('Loading your market planner…');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [history, setHistory] = useState<string | null>(null);
  const [compare, setCompare] = useState<string | null>(null);
  const settings = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);

  async function load() {
    settings.current?.abort();
    reading.current?.abort();
    const controller = new AbortController();
    settings.current = controller;
    setSaving(true);
    setReadings(null);
    try {
      const value = await plannerFetch<unknown>('/api/v2/market/planner', { signal: controller.signal });
      const parsed = plannerRecordSchema.safeParse({
        revision: (value as PlannerRecord).revision,
        planner: (value as PlannerRecord).planner,
      });
      if (!parsed.success) throw new Error('Your market planner could not be read.');
      if (controller.signal.aborted) return;
      setRecord(parsed.data);
      const list = (value as { searches?: unknown }).searches;
      setSearches(Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : null);
      setMessage('');
    } catch (error) {
      if (!controller.signal.aborted) {
        setRecord(null);
        setMessage(errorText(error, 'Your market planner is unavailable.'));
      }
    } finally {
      if (settings.current === controller) setSaving(false);
    }
  }

  useEffect(() => {
    void load();
    const hide = () => {
      if (document.hidden) {
        reading.current?.abort();
        setChecking(false);
        setReadings(null);
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      settings.current?.abort();
      reading.current?.abort();
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  async function save(planner: Planner, done: string): Promise<boolean> {
    if (!record || saving) {
      setMessage('Wait for the planner to load, or reload it.');
      return false;
    }
    settings.current?.abort();
    reading.current?.abort();
    const controller = new AbortController();
    settings.current = controller;
    setSaving(true);
    setChecking(false);
    setReadings(null);
    setMessage('Saving…');
    try {
      const next = await plannerFetch<PlannerRecord>('/api/v2/market/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: record.revision, planner }),
        signal: controller.signal,
      });
      const parsed = plannerRecordSchema.safeParse(next);
      if (!parsed.success) throw new Error('The save was not confirmed.');
      if (!controller.signal.aborted) {
        setRecord(parsed.data);
        setMessage(done);
      }
      return true;
    } catch (error) {
      // Never retried automatically: a stale tab must reload before writing again.
      if (!controller.signal.aborted)
        setMessage(`${errorText(error, 'The save was not confirmed.')} Reload the planner.`);
      return false;
    } finally {
      if (settings.current === controller) setSaving(false);
    }
  }

  async function check() {
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    setChecking(true);
    setReadings(null);
    setMessage('Checking current exchange listings…');
    try {
      const value = await plannerFetch<PlannerReadings>('/api/v2/market/planner/readings', {
        signal: controller.signal,
        timeoutMs: 45_000,
      });
      if (!controller.signal.aborted) {
        setReadings(value);
        const fresh = value.watches.filter((watch) => watch.alert.notify).length;
        setMessage(
          fresh
            ? `${fresh} new price ${fresh === 1 ? 'alert' : 'alerts'}.`
            : `Listings checked ${formatTime(value.readAt)}.`,
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(errorText(error, 'Listings could not be checked.'));
    } finally {
      if (reading.current === controller) setChecking(false);
    }
  }

  async function clearHistory() {
    try {
      await plannerFetch('/api/v2/market/planner/searches', { method: 'DELETE' });
      setSearches([]);
      setMessage('Search history cleared.');
    } catch (error) {
      setMessage(errorText(error, 'Search history could not be cleared.'));
    }
  }

  const planner = record?.planner;
  const watchReading = (id: string) => readings?.watches.find((entry) => entry.id === id);
  const basketReading = (templateId: string, grade: number | null | undefined) =>
    readings?.basket.find((entry) => entry.key === ladderKeyFor(templateId, grade));

  function addWatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planner) return;
    const form = new FormData(event.currentTarget);
    const below = optionalPrice(String(form.get('below') ?? ''));
    const above = optionalPrice(String(form.get('above') ?? ''));
    if ((below && !WHOLE.test(below)) || (above && !WHOLE.test(above))) {
      setMessage('Thresholds must be whole Solaris amounts.');
      return;
    }
    if (planner.watches.length >= WATCH_LIMIT) {
      setMessage(`Remove a watch before adding more than ${WATCH_LIMIT}.`);
      return;
    }
    const target = event.currentTarget;
    void save(
      {
        ...planner,
        watches: [
          ...planner.watches,
          {
            id: crypto.randomUUID(),
            templateId: String(form.get('templateId') ?? '').trim(),
            name: String(form.get('name') ?? '').trim(),
            grade: parseGrade(String(form.get('grade') ?? '')),
            below,
            above,
            cooldownMinutes: Number(form.get('cooldown')) as (typeof COOLDOWN_MINUTES)[number],
          },
        ],
      },
      'Watch saved. Check listings to see current asks.',
    ).then((ok) => ok && target.reset());
  }

  function addBasket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planner) return;
    const form = new FormData(event.currentTarget);
    const quantity = String(form.get('quantity') ?? '').trim();
    if (!POSITIVE.test(quantity)) {
      setMessage('Enter a whole quantity of at least 1.');
      return;
    }
    if (planner.basket.length >= BASKET_LIMIT) {
      setMessage(`Remove a line before adding more than ${BASKET_LIMIT}.`);
      return;
    }
    const target = event.currentTarget;
    void save(
      {
        ...planner,
        basket: [
          ...planner.basket,
          {
            templateId: String(form.get('templateId') ?? '').trim(),
            name: String(form.get('name') ?? '').trim(),
            grade: parseGrade(String(form.get('grade') ?? '')),
            quantity,
          },
        ],
      },
      'Added to your shopping basket.',
    ).then((ok) => ok && target.reset());
  }

  function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planner) return;
    const value = optionalPrice(String(new FormData(event.currentTarget).get('budget') ?? ''));
    if (value && !WHOLE.test(value)) {
      setMessage('The budget must be a whole Solaris amount.');
      return;
    }
    void save({ ...planner, budget: value }, value ? 'Budget saved.' : 'Budget cleared.');
  }

  function addFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planner) return;
    if (planner.filters.length >= FILTER_LIMIT) {
      setMessage(`Remove a saved filter before adding more than ${FILTER_LIMIT}.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const target = event.currentTarget;
    void save(
      {
        ...planner,
        filters: [
          ...planner.filters,
          {
            id: crypto.randomUUID(),
            label: String(form.get('label') ?? '').trim(),
            q: String(form.get('q') ?? '').trim(),
            sort: String(form.get('sort')) as Planner['filters'][number]['sort'],
            owner: String(form.get('owner')) as Planner['filters'][number]['owner'],
          },
        ],
      },
      'Filter saved.',
    ).then((ok) => ok && target.reset());
  }

  function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planner) return;
    if (planner.projects.length >= PROJECT_LIMIT) {
      setMessage(`Remove a project before adding more than ${PROJECT_LIMIT}.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const lines = String(form.get('materials') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const materials = [];
    for (const line of lines) {
      // One material per line: "<quantity> <template ID> <display name>".
      const match = /^([1-9][0-9]{0,29})\s+([\w./:-]{1,128})(?:\s+(.{1,120}))?$/.exec(line);
      if (!match) {
        setMessage(`Could not read “${line.slice(0, 60)}”. Use: quantity, template ID, then a name.`);
        return;
      }
      materials.push({ quantity: match[1]!, templateId: match[2]!, name: (match[3] ?? match[2]!).trim() });
    }
    if (!materials.length || materials.length > PROJECT_MATERIAL_LIMIT) {
      setMessage(`List 1–${PROJECT_MATERIAL_LIMIT} materials, one per line.`);
      return;
    }
    const target = event.currentTarget;
    void save(
      {
        ...planner,
        projects: [
          ...planner.projects,
          { id: crypto.randomUUID(), name: String(form.get('project') ?? '').trim(), materials },
        ],
      },
      'Project saved. Compare it with your storage when you are ready.',
    ).then((ok) => ok && target.reset());
  }

  const disabled = !planner || saving;
  const fresh = readings?.watches.filter((watch) => watch.alert.notify) ?? [];

  return (
    <div className="grid min-w-0 gap-6">
      <Card as="section" className="panel min-w-0 p-6" aria-labelledby="planner-status">
        <h2 id="planner-status" className="text-base">
          Your market planner
        </h2>
        <p className="mt-2 max-w-prose text-sm text-sand-400">
          Private to your account. Readings come from current exchange listings and your read-only Solaris balance.
          Nothing here buys, sells, reserves or moves items or currency.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" className="btn btn-ghost" disabled={saving || checking} onClick={() => void load()}>
            Reload planner
          </Button>
          <Button
            type="button"
            className="btn btn-primary"
            disabled={disabled || checking || (!planner?.watches.length && !planner?.basket.length)}
            onClick={() => void check()}
          >
            Check listings
          </Button>
          {checking && (
            <Button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                reading.current?.abort();
                setChecking(false);
                setMessage('Check cancelled. No readings kept.');
              }}
            >
              Cancel check
            </Button>
          )}
        </div>
        <p role="status" className="mt-4 break-words text-sm text-sand-300">
          {message}
        </p>
        {fresh.length > 0 && planner && (
          <ul aria-label="New price alerts" className="mt-3 grid gap-2">
            {fresh.map((entry) => {
              const watch = planner.watches.find((item) => item.id === entry.id);
              return (
                <li key={entry.id} className="border-l-4 border-l-status-warn bg-obsidian-950/60 p-3 text-sm">
                  <strong>{watch?.name ?? 'Watched item'}</strong>: {ALERT_TEXT[entry.alert.condition]}.
                </li>
              );
            })}
          </ul>
        )}
        {readings && !readings.alertsSaved && (
          <p className="mt-2 text-sm text-status-warn">Alert cooldowns could not be saved; you may see repeats.</p>
        )}
      </Card>

      {planner && (
        <>
          <Card as="section" className="panel min-w-0 p-6" aria-labelledby="watchlist-title">
            <h2 id="watchlist-title" className="text-base">
              Watchlist and price alerts
            </h2>
            <p className="mt-2 text-sm text-sand-400">
              Watch up to {WATCH_LIMIT} items, each for one grade or any grade. Alerts appear here when you check
              listings, then stay quiet for the cooldown you choose.
            </p>
            {planner.watches.length === 0 && <p className="mt-4 text-sm">No watched items yet.</p>}
            <ul className="mt-4 grid min-w-0 gap-3" aria-label="Watched items">
              {planner.watches.map((watch) => {
                const entry = watchReading(watch.id);
                return (
                  <li key={watch.id} className="min-w-0 break-words border border-sand-200/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="text-sm">{watch.name}</strong>{' '}
                        <span className="font-mono text-xs text-sand-400">
                          {gradeLabel(watch.grade)} · {watch.templateId}
                        </span>
                        <p className="mt-1 font-mono text-xs text-sand-400">
                          Low {watch.below ? formatDecimal(watch.below) : 'off'} · High{' '}
                          {watch.above ? formatDecimal(watch.above) : 'off'} · Cooldown{' '}
                          {COOLDOWN_LABELS[watch.cooldownMinutes]}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="btn btn-ghost"
                          aria-expanded={history === watch.id}
                          onClick={() => setHistory(history === watch.id ? null : watch.id)}
                        >
                          {history === watch.id ? 'Hide prices' : 'Observed prices'}
                        </Button>
                        <Button
                          type="button"
                          className="btn btn-ghost"
                          disabled={disabled}
                          aria-label={`Stop watching ${watch.name}`}
                          onClick={() =>
                            void save(
                              { ...planner, watches: planner.watches.filter((item) => item.id !== watch.id) },
                              'Watch removed.',
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm">
                      <LadderLine ladder={entry?.ladder} />
                    </p>
                    {entry && (
                      <p className="mt-1 text-xs text-sand-300">
                        {ALERT_TEXT[entry.alert.condition]}
                        {entry.alert.notifiedAt && ` · last alert ${formatTime(entry.alert.notifiedAt)}`}
                      </p>
                    )}
                    <PartyComparison ladder={entry?.ladder} />
                    {history === watch.id && (
                      <div className="mt-4">
                        <PriceHistory templateId={watch.templateId} grade={watch.grade ?? null} name={watch.name} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <form
              onSubmit={addWatch}
              className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              aria-label="Add a watch"
            >
              <label className={labelClass}>
                Template ID
                <input
                  name="templateId"
                  required
                  maxLength={128}
                  pattern="[\w./:\-]{1,128}"
                  defaultValue={prefill?.templateId}
                  className={field}
                />
              </label>
              <label className={labelClass}>
                Name
                <input name="name" required maxLength={120} defaultValue={prefill?.name} className={field} />
              </label>
              <label className={labelClass}>
                Grade
                <select name="grade" defaultValue={prefill?.grade ?? ''} className={field}>
                  <option value="">Any grade</option>
                  {Array.from({ length: 7 }, (_, grade) => (
                    <option key={grade} value={grade}>
                      Grade {grade}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Cooldown
                <select name="cooldown" defaultValue="60" className={field}>
                  {COOLDOWN_MINUTES.map((value) => (
                    <option key={value} value={value}>
                      {COOLDOWN_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Alert at or below
                <input
                  name="below"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={30}
                  placeholder="Optional"
                  className={field}
                />
              </label>
              <label className={labelClass}>
                Alert at or above
                <input
                  name="above"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={30}
                  placeholder="Optional"
                  className={field}
                />
              </label>
              <Button type="submit" className="btn btn-primary self-end" disabled={disabled}>
                Watch item
              </Button>
            </form>
          </Card>

          <Card as="section" className="panel min-w-0 p-6" aria-labelledby="basket-title">
            <h2 id="basket-title" className="text-base">
              Shopping basket and budget
            </h2>
            <p className="mt-2 text-sm text-sand-400">
              Estimates walk current sell orders cheapest first. Orders can change before you buy, so this is a planning
              estimate, not a quote.
            </p>
            {planner.basket.length === 0 && <p className="mt-4 text-sm">Your basket is empty.</p>}
            <ul className="mt-4 grid min-w-0 gap-3" aria-label="Shopping basket">
              {planner.basket.map((line) => {
                const entry = basketReading(line.templateId, line.grade);
                return (
                  <li
                    key={ladderKeyFor(line.templateId, line.grade)}
                    className="min-w-0 break-words border border-sand-200/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="text-sm">
                          {formatDecimal(line.quantity)} × {line.name}
                        </strong>{' '}
                        <span className="font-mono text-xs text-sand-400">{gradeLabel(line.grade)}</span>
                      </div>
                      <Button
                        type="button"
                        className="btn btn-ghost"
                        disabled={disabled}
                        aria-label={`Remove ${line.name} from the basket`}
                        onClick={() =>
                          void save(
                            { ...planner, basket: planner.basket.filter((item) => item !== line) },
                            'Removed from your basket.',
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                    <p className="mt-2 text-sm">
                      <LadderLine ladder={entry?.ladder} />
                    </p>
                    {entry &&
                      (entry.estimate ? (
                        <p className="mt-1 font-mono text-xs">
                          Estimated cost {formatDecimal(entry.estimate.cost)} for {formatDecimal(entry.estimate.filled)}{' '}
                          units
                          {entry.estimate.shortfall !== '0' && (
                            <span className="text-status-warn">
                              {' '}
                              · short {formatDecimal(entry.estimate.shortfall)} units
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-status-warn">No complete estimate for this line.</p>
                      ))}
                  </li>
                );
              })}
            </ul>
            <form
              onSubmit={addBasket}
              className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
              aria-label="Add to basket"
            >
              <label className={labelClass}>
                Template ID
                <input
                  name="templateId"
                  required
                  maxLength={128}
                  pattern="[\w./:\-]{1,128}"
                  defaultValue={prefill?.templateId}
                  className={field}
                />
              </label>
              <label className={labelClass}>
                Name
                <input name="name" required maxLength={120} defaultValue={prefill?.name} className={field} />
              </label>
              <label className={labelClass}>
                Grade
                <select name="grade" defaultValue={prefill?.grade ?? ''} className={field}>
                  <option value="">Any grade</option>
                  {Array.from({ length: 7 }, (_, grade) => (
                    <option key={grade} value={grade}>
                      Grade {grade}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Quantity
                <input
                  name="quantity"
                  required
                  inputMode="numeric"
                  pattern="[1-9][0-9]*"
                  maxLength={30}
                  className={field}
                />
              </label>
              <Button type="submit" className="btn btn-primary self-end" disabled={disabled}>
                Add to basket
              </Button>
            </form>
            <form onSubmit={saveBudget} className="mt-6 flex flex-wrap items-end gap-3" aria-label="Personal budget">
              <label className={labelClass}>
                Personal budget (optional)
                <input
                  name="budget"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={30}
                  defaultValue={planner.budget ?? ''}
                  key={planner.budget ?? 'none'}
                  className={field}
                />
              </label>
              <Button type="submit" className="btn btn-ghost" disabled={disabled}>
                Save budget
              </Button>
            </form>
            {readings && planner.basket.length > 0 && (
              <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" aria-label="Budget comparison">
                <dt className="text-sand-400">Estimated basket</dt>
                <dd className="font-mono">
                  {formatDecimal(readings.budget.estimate)}
                  {!readings.budget.estimateComplete && ' (lower bound: some lines are incomplete)'}
                </dd>
                <dt className="text-sand-400">Solaris balance</dt>
                <dd className="font-mono">
                  {readings.budget.balance !== null && readings.budget.balance !== undefined
                    ? `${formatDecimal(readings.budget.balance)} (read-only)`
                    : readings.balance.status === 'unlinked'
                      ? 'Link your character to compare with your balance'
                      : 'Unavailable'}
                </dd>
                <dt className="text-sand-400">Against balance</dt>
                <dd>
                  {readings.budget.balanceStatus === 'over'
                    ? `Over by ${formatDecimal(readings.budget.balanceShortfall)}`
                    : readings.budget.balanceStatus === 'within'
                      ? 'Affordable at current listings'
                      : 'Unknown'}
                </dd>
                <dt className="text-sand-400">Against budget</dt>
                <dd>
                  {readings.budget.budgetStatus === 'unset'
                    ? 'No budget set'
                    : readings.budget.budgetStatus === 'over'
                      ? 'Over your budget'
                      : readings.budget.budgetStatus === 'within'
                        ? 'Within your budget'
                        : 'Unknown'}
                </dd>
              </dl>
            )}
          </Card>

          <Card as="section" className="panel min-w-0 p-6" aria-labelledby="projects-title">
            <h2 id="projects-title" className="text-base">
              Project shopping lists
            </h2>
            <p className="mt-2 text-sm text-sand-400">
              Compare planned materials with what your authorized storage currently holds (all grades), then see what is
              left to buy. Comparisons count items; they never reserve them.
            </p>
            {planner.projects.length === 0 && <p className="mt-4 text-sm">No projects yet.</p>}
            <ul className="mt-4 grid min-w-0 gap-3" aria-label="Projects">
              {planner.projects.map((project) => (
                <li key={project.id} className="min-w-0 break-words border border-sand-200/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="text-sm">{project.name}</strong>
                      <p className="mt-1 font-mono text-xs text-sand-400">
                        {project.materials
                          .map((material) => `${formatDecimal(material.quantity)} ${material.name}`)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="btn btn-primary"
                        disabled={saving}
                        aria-expanded={compare === project.id}
                        onClick={() => setCompare(compare === project.id ? null : project.id)}
                      >
                        {compare === project.id ? 'Hide comparison' : 'Compare with storage'}
                      </Button>
                      <Button
                        type="button"
                        className="btn btn-ghost"
                        disabled={disabled}
                        aria-label={`Delete project ${project.name}`}
                        onClick={() => {
                          if (compare === project.id) setCompare(null);
                          void save(
                            { ...planner, projects: planner.projects.filter((item) => item.id !== project.id) },
                            'Project deleted.',
                          );
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {compare === project.id && <ProjectComparison projectId={project.id} />}
                </li>
              ))}
            </ul>
            <form onSubmit={addProject} className="mt-6 grid gap-3" aria-label="Add a project">
              <label className={labelClass}>
                Project name
                <input name="project" required maxLength={80} className={field} />
              </label>
              <label className={labelClass}>
                Materials, one per line: quantity, template ID, name
                <textarea
                  name="materials"
                  required
                  rows={4}
                  maxLength={4000}
                  placeholder={'200 PlastaniumIngot Plastanium ingot\n50 SpiceMelange Spice melange'}
                  className={`${field} h-auto py-2 font-mono`}
                />
              </label>
              <Button type="submit" className="btn btn-primary justify-self-start" disabled={disabled}>
                Save project
              </Button>
            </form>
          </Card>

          <Card as="section" className="panel min-w-0 p-6" aria-labelledby="filters-title">
            <h2 id="filters-title" className="text-base">
              Saved filters and recent searches
            </h2>
            {planner.filters.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Saved filters">
                {planner.filters.map((filter) => (
                  <li key={filter.id} className="flex items-center gap-1 border border-sand-200/20 pl-3">
                    <Link
                      prefetch={false}
                      href={marketHref({ q: filter.q, sort: filter.sort, owner: filter.owner, page: 1 })}
                      className="text-sm text-spice-300 underline"
                    >
                      {filter.label}
                    </Link>
                    <Button
                      type="button"
                      className="btn btn-ghost"
                      disabled={disabled}
                      aria-label={`Remove saved filter ${filter.label}`}
                      onClick={() =>
                        void save(
                          { ...planner, filters: planner.filters.filter((item) => item.id !== filter.id) },
                          'Filter removed.',
                        )
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm">No saved filters yet.</p>
            )}
            <form
              onSubmit={addFilter}
              className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
              aria-label="Save a filter"
            >
              <label className={labelClass}>
                Label
                <input name="label" required maxLength={60} className={field} />
              </label>
              <label className={labelClass}>
                Search
                <input name="q" maxLength={128} className={field} />
              </label>
              <label className={labelClass}>
                Sort
                <select name="sort" defaultValue="listed" className={field}>
                  {MARKET_SORTS.map((sort) => (
                    <option key={sort} value={sort}>
                      {SORT_LABELS[sort]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Show
                <select name="owner" defaultValue="all" className={field}>
                  {MARKET_OWNERS.map((owner) => (
                    <option key={owner} value={owner}>
                      {OWNER_LABELS[owner]}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" className="btn btn-primary self-end" disabled={disabled}>
                Save filter
              </Button>
            </form>
            <h3 className="mt-6 text-sm font-semibold">Recent searches</h3>
            {searches === null ? (
              <p className="mt-2 text-sm text-sand-400">Search history is unavailable right now.</p>
            ) : searches.length === 0 ? (
              <p className="mt-2 text-sm text-sand-400">Searches you run on the market appear here.</p>
            ) : (
              <>
                <ul className="mt-2 flex flex-wrap gap-2" aria-label="Recent searches">
                  {searches.map((search) => (
                    <li key={search}>
                      <Link
                        prefetch={false}
                        href={marketHref({ q: search, sort: 'listed', owner: 'all', page: 1 })}
                        className="inline-flex min-h-11 items-center border border-sand-200/20 px-3 text-sm text-spice-300 underline"
                      >
                        {search}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Button type="button" className="btn btn-ghost mt-3" onClick={() => void clearHistory()}>
                  Clear search history
                </Button>
              </>
            )}
          </Card>
        </>
      )}

      <MarketInsights />
    </div>
  );
}
