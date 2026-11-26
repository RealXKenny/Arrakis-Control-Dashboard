'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/form-controls';
import { formatDecimal } from '../../../lib/format';
import type { FinderResult } from '../../player/item-finder';
import { baseHref, type CareBase, type StockpileLine } from '../care';
import {
  CONTAINER_ZONES,
  DEFAULT_GENERATOR_ALERT_HOURS,
  DEFAULT_WATER_ALERT_PERCENT,
  UPKEEP_LIMITS,
  checklistFor,
  quantitySchema,
  type BaseSettingsInput,
  type BaseUpkeep,
  type CheckItem,
  type ContainerZone,
} from '../model';
import { upkeepFetch, type useUpkeep } from './use-upkeep';

type State = ReturnType<typeof useUpkeep>;
const settingsOf = (baseId: string, plan: BaseUpkeep | undefined): BaseSettingsInput => ({
  baseId,
  waterAlertPercent: plan?.waterAlertPercent ?? null,
  generatorAlertHours: plan?.generatorAlertHours ?? null,
  inspectEveryDays: plan?.inspectEveryDays ?? null,
  minimums: plan?.minimums ?? [],
  checklist: plan?.checklist ?? [],
});
const optionalInt = (value: string) => (value.trim() === '' ? null : Number(value));

export function BasePlans({ state, bases }: { state: State; bases: CareBase[] }) {
  const record = state.record!;
  const visible = new Set(bases.map((base) => base.id));
  const orphaned = record.bases.filter((plan) => !visible.has(plan.baseId));
  return (
    <>
      {!bases.length && (
        <p className="mb-6 text-sm text-sand-400">
          No current bases were read. Refresh readings, or check Holdings for the bases your character can access.
        </p>
      )}
      <ul className="grid gap-6">
        {bases.map((base) => (
          <li key={base.id} id={`upkeep-base-${base.id}`} className="min-w-0 scroll-mt-24">
            <BasePlan state={state} base={base} plan={record.bases.find((plan) => plan.baseId === base.id)} />
          </li>
        ))}
      </ul>
      {orphaned.length > 0 && (
        <Card as="section" className="panel mt-6 min-w-0 p-6" aria-labelledby="orphaned-title">
          <h2 id="orphaned-title" className="text-base">
            Plans for bases not currently available
          </h2>
          <p className="mt-2 text-sm text-sand-400">
            These bases were not in your latest authorised reading. Their plans stay private and unused until access
            returns.
          </p>
          <ul className="mt-3 grid gap-2">
            {orphaned.map((plan) => (
              <li key={plan.baseId} className="flex flex-wrap items-center gap-3 text-sm">
                Base #{plan.baseId}
                <Button
                  type="button"
                  variant="danger"
                  disabled={state.saving}
                  onClick={() => void state.save({ action: 'base-remove', baseId: plan.baseId }, 'Base plan removed.')}
                >
                  Remove plan
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function BasePlan({ state, base, plan }: { state: State; base: CareBase; plan: BaseUpkeep | undefined }) {
  const settings = settingsOf(base.id, plan);
  const [water, setWater] = useState(settings.waterAlertPercent?.toString() ?? '');
  const [generator, setGenerator] = useState(settings.generatorAlertHours?.toString() ?? '');
  const [cadence, setCadence] = useState(settings.inspectEveryDays?.toString() ?? '');
  const saveSettings = (patch: Partial<BaseSettingsInput>, done: string) =>
    state.save({ action: 'base', base: { ...settings, ...patch } }, done);
  return (
    <Card as="section" className="panel min-w-0 p-6" aria-labelledby={`plan-${base.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={`plan-${base.id}`} className="break-words text-base">
          {base.name}
        </h2>
        <Link href={baseHref(base)} className="text-sm text-spice-300 underline">
          View in Holdings
        </Link>
      </div>
      <p className="mt-1 text-sm text-sand-400">
        Water {base.water.percent === null ? 'unknown' : `${Math.round(base.water.percent)}%`} · Generator{' '}
        {base.generatorSeconds === null ? 'not reported' : `${(base.generatorSeconds / 3600).toFixed(1)}h reported`}
      </p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void saveSettings(
            {
              waterAlertPercent: optionalInt(water),
              generatorAlertHours: optionalInt(generator),
              inspectEveryDays: optionalInt(cadence),
            },
            'Alert settings saved.',
          );
        }}
      >
        <Field label="Water alert (%)" hint={`Blank uses ${DEFAULT_WATER_ALERT_PERCENT}%.`}>
          <input
            className={inputClass}
            type="number"
            min={1}
            max={99}
            value={water}
            onChange={(e) => setWater(e.target.value)}
          />
        </Field>
        <Field label="Generator reminder (hours)" hint={`Blank uses ${DEFAULT_GENERATOR_ALERT_HOURS}h.`}>
          <input
            className={inputClass}
            type="number"
            min={1}
            max={720}
            value={generator}
            onChange={(e) => setGenerator(e.target.value)}
          />
        </Field>
        <Field label="Inspect every (days)" hint="Blank never marks inspections due.">
          <input
            className={inputClass}
            type="number"
            min={1}
            max={90}
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="primary" disabled={state.saving}>
            Save alert settings
          </Button>
        </div>
      </form>
      <Minimums state={state} base={base} settings={settings} saveSettings={saveSettings} />
      <Inspection state={state} base={base} plan={plan} settings={settings} saveSettings={saveSettings} />
      <Containers state={state} base={base} />
    </Card>
  );
}

function Minimums({
  state,
  base,
  settings,
  saveSettings,
}: {
  state: State;
  base: CareBase;
  settings: BaseSettingsInput;
  saveSettings: (patch: Partial<BaseSettingsInput>, done: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<{ templateId: string; name: string }[]>([]);
  const [choice, setChoice] = useState<{ templateId: string; name: string } | null>(null);
  const [minimum, setMinimum] = useState('');
  const [lines, setLines] = useState<StockpileLine[] | null>(null);
  const [coverage, setCoverage] = useState<Omit<FinderResult, 'items'> | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const scan = useRef<AbortController | null>(null);
  async function lookUp() {
    setBusy(true);
    setNote('Searching your authorised storage…');
    try {
      const result = (await upkeepFetch(`/api/v2/items/find?q=${encodeURIComponent(query)}`, {
        timeoutMs: 30_000,
      })) as FinderResult;
      const unique = new Map(
        result.items.filter((item) => item.templateId).map((item) => [item.templateId, item.name]),
      );
      setMatches([...unique].slice(0, 12).map(([templateId, name]) => ({ templateId, name })));
      setNote(unique.size ? 'Choose an item to set a minimum.' : 'No matching items were observed.');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    scan.current?.abort();
    const controller = new AbortController();
    scan.current = controller;
    setBusy(true);
    setLines(null);
    setCoverage(null);
    setNote('Checking this base’s authorised containers…');
    try {
      const value = (await upkeepFetch(`/api/v2/upkeep/stockpile?base=${base.id}`, {
        signal: controller.signal,
        timeoutMs: 30_000,
      })) as { lines: StockpileLine[]; coverage: Omit<FinderResult, 'items'> | null };
      setLines(value.lines);
      setCoverage(value.coverage);
      setNote('Stockpile checked. Partial coverage can show a target as met, never as short.');
    } catch (error) {
      if (!controller.signal.aborted) setNote(error instanceof Error ? error.message : 'Stockpile check failed.');
    } finally {
      if (scan.current === controller) setBusy(false);
    }
  }
  const partial = coverage && (coverage.limited || coverage.sources.some((source) => source.status !== 'ok'));
  return (
    <section className="mt-6 border-t border-sand-200/10 pt-5" aria-labelledby={`min-${base.id}`}>
      <h3 id={`min-${base.id}`} className="text-sm font-semibold">
        Stockpile minimums
      </h3>
      <p className="mt-1 text-sm text-sand-400">
        Up to {UPKEEP_LIMITS.minimums} essentials with your own targets. Checks read this base’s containers you can
        open; they never move or reserve items.
      </p>
      {settings.minimums.length > 0 && (
        <ul className="mt-3 grid gap-2" aria-label={`Minimums for ${base.name}`}>
          {settings.minimums.map((entry) => {
            const line = lines?.find((value) => value.templateId === entry.templateId);
            return (
              <li
                key={entry.templateId}
                className="flex flex-wrap items-center gap-3 border border-sand-200/15 p-3 text-sm"
              >
                <span className="min-w-0 flex-1 break-words">
                  <strong>{entry.name}</strong> · target {formatDecimal(entry.minimum)}
                  {line && (
                    <span
                      className={
                        line.status === 'below'
                          ? 'text-status-danger'
                          : line.status === 'met'
                            ? 'text-status-ok'
                            : 'text-status-warn'
                      }
                    >
                      {' '}
                      · observed {formatDecimal(line.observed)}
                      {line.status === 'below'
                        ? ` · short by ${formatDecimal(line.shortfall)}`
                        : line.status === 'met'
                          ? ' · met'
                          : ' · unknown (incomplete reading)'}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  disabled={state.saving}
                  onClick={() =>
                    void saveSettings(
                      { minimums: settings.minimums.filter((value) => value.templateId !== entry.templateId) },
                      'Minimum removed.',
                    )
                  }
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={busy || !settings.minimums.length}
          onClick={() => void check()}
        >
          Check stockpile
        </Button>
      </div>
      {partial && (
        <p className="mt-2 text-sm text-status-warn">
          Coverage was partial: {coverage.sources.filter((source) => source.status !== 'ok').length} source(s) were
          limited, excluded or unavailable.
        </p>
      )}
      {settings.minimums.length < UPKEEP_LIMITS.minimums && (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void lookUp();
          }}
        >
          <Field label="Find an item to track">
            <input
              className={inputClass}
              type="search"
              maxLength={128}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <Button variant="secondary" type="submit" className="self-end" disabled={busy || !query.trim()}>
            Look up
          </Button>
        </form>
      )}
      {matches.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Matching items">
          {matches.map((item) => (
            <Button
              key={item.templateId}
              type="button"
              aria-pressed={choice?.templateId === item.templateId}
              onClick={() => setChoice(item)}
            >
              {item.name}
            </Button>
          ))}
        </div>
      )}
      {choice && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!quantitySchema.safeParse(minimum).success) {
              setNote('Enter a whole-number minimum.');
              return;
            }
            if (settings.minimums.some((entry) => entry.templateId.toLowerCase() === choice.templateId.toLowerCase())) {
              setNote('That item already has a minimum.');
              return;
            }
            void saveSettings(
              { minimums: [...settings.minimums, { ...choice, name: choice.name.slice(0, 200), minimum }] },
              'Minimum saved.',
            ).then((ok) => {
              if (ok) {
                setChoice(null);
                setMinimum('');
                setMatches([]);
              }
            });
          }}
        >
          <Field label={`Minimum for ${choice.name}`}>
            <input
              className={inputClass}
              inputMode="numeric"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value.trim())}
            />
          </Field>
          <Button type="submit" variant="primary" className="self-end" disabled={state.saving}>
            Save minimum
          </Button>
        </form>
      )}
      <p role="status" className="mt-2 min-h-5 text-sm text-sand-400">
        {note}
      </p>
    </section>
  );
}

function Inspection({
  state,
  base,
  plan,
  settings,
  saveSettings,
}: {
  state: State;
  base: CareBase;
  plan: BaseUpkeep | undefined;
  settings: BaseSettingsInput;
  saveSettings: (patch: Partial<BaseSettingsInput>, done: string) => Promise<boolean>;
}) {
  const checklist = checklistFor(plan);
  const [results, setResults] = useState<Record<string, { status: 'ok' | 'attention' | 'skipped'; note: string }>>({});
  const [label, setLabel] = useState('');
  const last = plan?.inspections.at(-1);
  const hint = (item: CheckItem) =>
    item.kind === 'water'
      ? `Reported: ${base.water.percent === null ? 'unknown' : `${Math.round(base.water.percent)}%`}`
      : item.kind === 'power'
        ? `Reported: ${base.generatorSeconds === null ? 'not reported' : `${(base.generatorSeconds / 3600).toFixed(1)}h`}`
        : item.kind === 'supplies'
          ? 'Use Check stockpile above.'
          : item.kind === 'access'
            ? 'Check manually in game; the dashboard cannot verify door access.'
            : '';
  return (
    <section className="mt-6 border-t border-sand-200/10 pt-5" aria-labelledby={`check-${base.id}`}>
      <h3 id={`check-${base.id}`} className="text-sm font-semibold">
        Inspection checklist
      </h3>
      <p className="mt-1 text-sm text-sand-400">
        {last
          ? `Last inspection recorded ${new Date(last.at).toLocaleString()}: ${last.results.filter((r) => r.status === 'attention').length} item(s) needed attention.`
          : 'No inspection recorded yet.'}{' '}
        Recording an inspection only saves your notes.
      </p>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const entries = checklist.map((item) => ({
            itemId: item.id,
            status: results[item.id]?.status ?? 'skipped',
            note: (results[item.id]?.note ?? '').slice(0, 300),
          }));
          const ensure = plan?.checklist.length
            ? Promise.resolve(true)
            : saveSettings({ checklist }, 'Checklist saved.');
          void ensure.then((ok) => {
            if (!ok) return;
            void state
              .save({ action: 'inspect', baseId: base.id, results: entries }, 'Inspection recorded.')
              .then((saved) => saved && setResults({}));
          });
        }}
      >
        {checklist.map((item) => (
          <fieldset
            key={item.id}
            className="grid gap-2 border border-sand-200/15 p-3 sm:grid-cols-[minmax(0,1fr)_10rem]"
          >
            <legend className="px-1 text-sm font-semibold">{item.label}</legend>
            <p className="text-xs text-sand-400 sm:col-span-2">{hint(item)}</p>
            <input
              className={inputClass}
              aria-label={`Note for ${item.label}`}
              maxLength={300}
              value={results[item.id]?.note ?? ''}
              onChange={(e) =>
                setResults((old) => ({
                  ...old,
                  [item.id]: { status: old[item.id]?.status ?? 'skipped', note: e.target.value },
                }))
              }
            />
            <select
              className={inputClass}
              aria-label={`Result for ${item.label}`}
              value={results[item.id]?.status ?? 'skipped'}
              onChange={(e) =>
                setResults((old) => ({
                  ...old,
                  [item.id]: {
                    note: old[item.id]?.note ?? '',
                    status: e.target.value as 'ok' | 'attention' | 'skipped',
                  },
                }))
              }
            >
              <option value="skipped">Not checked</option>
              <option value="ok">OK</option>
              <option value="attention">Needs attention</option>
            </select>
            {settings.checklist.length > 0 && (
              <Button
                variant="secondary"
                type="button"
                className="justify-self-start"
                disabled={state.saving || settings.checklist.length <= 1}
                onClick={() =>
                  void saveSettings(
                    { checklist: settings.checklist.filter((value) => value.id !== item.id) },
                    'Check removed.',
                  )
                }
              >
                Remove check
              </Button>
            )}
          </fieldset>
        ))}
        <div>
          <Button type="submit" variant="primary" disabled={state.saving}>
            Record inspection
          </Button>
        </div>
      </form>
      {checklist.length < UPKEEP_LIMITS.checklist && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!label.trim()) return;
            void saveSettings(
              {
                checklist: [
                  ...checklist,
                  { id: crypto.randomUUID(), label: label.trim().slice(0, 120), kind: 'custom' },
                ],
              },
              'Check added.',
            ).then((ok) => ok && setLabel(''));
          }}
        >
          <Field label="Add a custom check">
            <input className={inputClass} maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Button variant="secondary" type="submit" className="self-end" disabled={state.saving || !label.trim()}>
            Add check
          </Button>
        </form>
      )}
    </section>
  );
}

function Containers({ state, base }: { state: State; base: CareBase }) {
  const record = state.record!;
  const labels = record.containers.filter((entry) => entry.baseId === base.id);
  const [containers, setContainers] = useState<{ containerId: string; name: string }[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { alias: string; zone: ContainerZone }>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setNote('Checking which containers you can open…');
    try {
      const value = (await upkeepFetch(`/api/v2/upkeep/containers?base=${base.id}`, { timeoutMs: 20_000 })) as {
        containers: { containerId: string; name: string }[];
        omitted: number;
        limited: boolean;
      };
      setContainers(value.containers);
      setNote(
        `${value.containers.length} accessible container(s).${value.omitted ? ` ${value.omitted} restricted or unverifiable container(s) omitted.` : ''}${value.limited ? ' Only the first 80 are listed.' : ''}`,
      );
    } catch (error) {
      setContainers(null);
      setNote(error instanceof Error ? error.message : 'Containers could not be checked.');
    } finally {
      setBusy(false);
    }
  }
  const draftFor = (containerId: string) => {
    const saved = labels.find((entry) => entry.containerId === containerId);
    return drafts[containerId] ?? { alias: saved?.alias ?? '', zone: saved?.zone ?? 'Other' };
  };
  const rows =
    containers ?? labels.map((entry) => ({ containerId: entry.containerId, name: `Container #${entry.containerId}` }));
  return (
    <section className="mt-6 border-t border-sand-200/10 pt-5" aria-labelledby={`zones-${base.id}`}>
      <h3 id={`zones-${base.id}`} className="text-sm font-semibold">
        Container aliases and zones
      </h3>
      <p className="mt-1 text-sm text-sand-400">
        Private labels for containers you can open. They never rename anything in game.
      </p>
      <Button variant="secondary" type="button" className="mt-3" disabled={busy} onClick={() => void load()}>
        Load accessible containers
      </Button>
      <p role="status" className="mt-2 min-h-5 text-sm text-sand-400">
        {note}
      </p>
      <ul className="mt-2 grid gap-2">
        {rows.map((container) => {
          const draft = draftFor(container.containerId);
          const saved = labels.find((entry) => entry.containerId === container.containerId);
          return (
            <li
              key={container.containerId}
              className="grid gap-2 border border-sand-200/15 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto_auto]"
            >
              <span className="self-center break-words text-sm">
                {container.name} #{container.containerId}
                {saved && (
                  <span className="block text-xs text-spice-300">
                    {saved.zone}: {saved.alias}
                  </span>
                )}
              </span>
              <input
                className={inputClass}
                aria-label={`Alias for container ${container.containerId}`}
                maxLength={60}
                value={draft.alias}
                onChange={(e) =>
                  setDrafts((old) => ({ ...old, [container.containerId]: { ...draft, alias: e.target.value } }))
                }
              />
              <select
                className={inputClass}
                aria-label={`Zone for container ${container.containerId}`}
                value={draft.zone}
                onChange={(e) =>
                  setDrafts((old) => ({
                    ...old,
                    [container.containerId]: { ...draft, zone: e.target.value as ContainerZone },
                  }))
                }
              >
                {CONTAINER_ZONES.map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </select>
              <Button
                type="button"
                disabled={state.saving || !draft.alias.trim()}
                onClick={() =>
                  void state.save(
                    {
                      action: 'container',
                      label: {
                        baseId: base.id,
                        containerId: container.containerId,
                        alias: draft.alias.trim(),
                        zone: draft.zone,
                      },
                    },
                    'Container label saved.',
                  )
                }
              >
                Save
              </Button>
              {saved ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={state.saving}
                  onClick={() =>
                    void state.save(
                      { action: 'container-remove', baseId: base.id, containerId: container.containerId },
                      'Container label removed.',
                    )
                  }
                >
                  Clear
                </Button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
