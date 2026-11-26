'use client';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DataFreshness } from '../../monitoring/components/data-freshness';
import { beginCheck, emptyHealth, failedRead, sourceReadTime, successfulRead } from '../../monitoring/freshness';
import type { FoundItem } from '../item-finder';
import {
  COMPARE_LIMIT,
  FILTER_LIMIT,
  ITEM_KINDS,
  LOADOUT_ITEM_LIMIT,
  LOADOUT_LIMIT,
  LOADOUT_PURPOSES,
  STORAGE_RULE_LIMIT,
  WATCH_LIMIT,
  compareGear,
  coverageComplete,
  emptyPlanner,
  itemKindLabel,
  loadoutPurposeLabel,
  plannerRecordSchema,
  resupplyChecklist,
  type Coverage,
  type Loadout,
  type LoadoutItem,
  type LoadoutReadiness,
  type Planner,
  type PlannerRecord,
  type SavedFilter,
  type SnapshotChange,
  type StorageSuggestion,
  type WearReading,
} from '../equipment';

class EquipmentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function payload(response: Response): Promise<Record<string, unknown>> {
  const value = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new EquipmentRequestError(
      typeof value.error === 'string' ? value.error : 'Equipment request failed.',
      response.status,
    );
  return value;
}
function plannerRecord(value: unknown): PlannerRecord {
  const parsed = plannerRecordSchema.safeParse(value);
  if (!parsed.success) throw new Error('Equipment plans could not be read.');
  return parsed.data;
}
type Reading = {
  revision: string | null;
  coverage: Coverage;
  filter: { id: string | null; name: string };
  matches: FoundItem[];
  matchesLimited: boolean;
  readiness: LoadoutReadiness[];
  wear: WearReading[];
  storage: StorageSuggestion[];
  containers: { checked: number; verifiedCapacity: number };
};
type History = {
  revision: string | null;
  snapshots: { id: string; takenAt: string; complete: boolean; truncated: boolean; templates: number }[];
  changes: { from: string; to: string; changes: SnapshotChange[] }[];
};
const TABS = [
  ['loadouts', 'Loadouts and readiness'],
  ['gear', 'Gear and filters'],
  ['wear', 'Wear watchlist'],
  ['storage', 'Storage suggestions'],
  ['history', 'Change history'],
] as const;
type Tab = (typeof TABS)[number][0];
const field = 'h-11 min-w-0 border border-sand-200/20 bg-obsidian-900 px-3 text-sm';
const statusLabel = { ready: 'Ready', missing: 'Missing', unsuitable: 'Unsuitable', unconfirmed: 'Unconfirmed' };
const blankItem = (): LoadoutItem => ({
  templateId: '',
  name: '',
  quantity: '1',
  minGrade: null,
  minDurabilityPercent: null,
});
const blankFilter = (): SavedFilter => ({
  id: crypto.randomUUID(),
  name: '',
  text: '',
  minGrade: null,
  maxGrade: null,
  kind: 'any',
  augments: 'any',
  augmentText: '',
  source: 'any',
  locationText: '',
});
const optionalNumber = (value: string) => (value.trim() === '' ? null : Number(value));
const when = (value: string) => new Date(value).toLocaleString();

export function EquipmentPlanner() {
  const [tab, setTab] = useState<Tab>('loadouts');
  const [record, setRecord] = useState<PlannerRecord | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [health, setHealth] = useState(emptyHealth);
  const [message, setMessage] = useState('Loading equipment plans…');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filterId, setFilterId] = useState('');
  const [draft, setDraft] = useState<Loadout | null>(null);
  const [filterDraft, setFilterDraft] = useState<SavedFilter | null>(null);
  const [compare, setCompare] = useState<FoundItem[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [ruleDraft, setRuleDraft] = useState({ containerLabel: '', itemText: '' });
  const settings = useRef<AbortController | null>(null);
  const scan = useRef<AbortController | null>(null);

  function clearReadings() {
    scan.current?.abort();
    setReading(null);
    setCompare([]);
    setBusy(false);
  }
  async function loadPlanner() {
    settings.current?.abort();
    const controller = new AbortController();
    settings.current = controller;
    setSaving(true);
    setMessage('Loading equipment plans…');
    clearReadings();
    setHealth(emptyHealth());
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
      const [plans, changes] = await Promise.all([
        fetch('/api/v2/equipment', { cache: 'no-store', signal }).then(payload),
        fetch('/api/v2/equipment/history', { cache: 'no-store', signal }).then(payload),
      ]);
      if (!controller.signal.aborted) {
        setRecord(plannerRecord(plans));
        setHistory(changes as unknown as History);
        setMessage('');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setRecord(null);
        setHistory(null);
        setMessage(error instanceof Error ? error.message : 'Equipment plans unavailable.');
      }
    } finally {
      if (settings.current === controller) setSaving(false);
    }
  }
  useEffect(() => {
    void loadPlanner();
    const hide = () => {
      if (document.hidden) {
        clearReadings();
        setHealth((previous) => ({ ...previous, phase: 'paused' }));
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      settings.current?.abort();
      scan.current?.abort();
      document.removeEventListener('visibilitychange', hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; handlers read current refs.
  }, []);

  async function save(planner: Planner, done: string): Promise<boolean> {
    if (!record || saving) {
      setMessage('Wait for equipment plans to load, or refresh plans.');
      return false;
    }
    settings.current?.abort();
    clearReadings();
    setHealth(emptyHealth());
    const controller = new AbortController();
    settings.current = controller;
    setSaving(true);
    setMessage('Saving equipment plans…');
    try {
      const next = plannerRecord(
        await payload(
          await fetch('/api/v2/equipment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revision: record.revision, planner }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          }),
        ),
      );
      if (controller.signal.aborted) return false;
      setRecord(next);
      setMessage(`${done} Check equipment for current observations.`);
      return true;
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          `${error instanceof Error ? error.message : 'Save was not confirmed.'} Refresh plans before another change.`,
        );
      return false;
    } finally {
      if (settings.current === controller) setSaving(false);
    }
  }
  async function check() {
    scan.current?.abort();
    const controller = new AbortController();
    scan.current = controller;
    setBusy(true);
    setReading(null);
    setCompare([]);
    setHealth((previous) => beginCheck(previous));
    setMessage('Checking current authorized sources…');
    try {
      const query = filterId ? `?filter=${encodeURIComponent(filterId)}` : '';
      const next = (await payload(
        await fetch(`/api/v2/equipment/readings${query}`, {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        }),
      )) as unknown as Reading;
      if (controller.signal.aborted) return;
      if (next.revision !== record?.revision) {
        setMessage('Equipment plans changed. Refresh plans before checking.');
        setHealth(emptyHealth());
        return;
      }
      const partial = !coverageComplete(next.coverage);
      setReading(next);
      setTicked(new Set());
      setHealth((previous) => successfulRead(previous, sourceReadTime(next.coverage.sources), partial));
      setMessage(partial ? 'Checked with partial coverage. Review sources below.' : 'Equipment checked.');
    } catch (error) {
      if (!controller.signal.aborted) {
        setHealth((previous) =>
          failedRead(previous, error instanceof EquipmentRequestError && [401, 403, 409].includes(error.status)),
        );
        setMessage(error instanceof Error ? error.message : 'Equipment check failed.');
      }
    } finally {
      if (scan.current === controller) setBusy(false);
    }
  }
  async function historyAction(action: 'record' | 'clear') {
    if (!history) return;
    scan.current?.abort();
    const controller = new AbortController();
    scan.current = controller;
    setBusy(true);
    setMessage(action === 'record' ? 'Recording an inventory snapshot…' : 'Clearing inventory history…');
    try {
      const next = (await payload(
        await fetch('/api/v2/equipment/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: history.revision, action }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        }),
      )) as unknown as History;
      if (!controller.signal.aborted) {
        setHistory(next);
        setMessage(action === 'record' ? 'Snapshot recorded.' : 'Inventory history cleared.');
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          `${error instanceof Error ? error.message : 'History change was not confirmed.'} Refresh plans before trying again.`,
        );
    } finally {
      if (scan.current === controller) setBusy(false);
    }
  }

  const planner = record?.planner ?? emptyPlanner();
  const locked = saving || busy || !record;
  function addToLoadout(loadoutId: string, item: FoundItem) {
    const loadout = planner.loadouts.find((entry) => entry.id === loadoutId);
    if (!loadout || !item.templateId) return;
    if (loadout.items.some((entry) => entry.templateId.toLowerCase() === item.templateId.toLowerCase())) {
      setMessage(`${item.name} is already in ${loadout.name}.`);
      return;
    }
    if (loadout.items.length >= LOADOUT_ITEM_LIMIT) {
      setMessage(`A loadout holds at most ${LOADOUT_ITEM_LIMIT} items.`);
      return;
    }
    const next = { ...blankItem(), templateId: item.templateId, name: item.name.slice(0, 120) };
    void save(
      {
        ...planner,
        loadouts: planner.loadouts.map((entry) =>
          entry.id === loadoutId ? { ...entry, items: [...entry.items, next] } : entry,
        ),
      },
      `${item.name} added to ${loadout.name}.`,
    );
  }
  function watch(item: FoundItem) {
    if (planner.watchlist.some((entry) => entry.templateId.toLowerCase() === item.templateId.toLowerCase())) {
      setMessage(`${item.name} is already watched.`);
      return;
    }
    if (planner.watchlist.length >= WATCH_LIMIT) {
      setMessage(`Remove a watched item before adding more than ${WATCH_LIMIT}.`);
      return;
    }
    void save(
      {
        ...planner,
        watchlist: [
          ...planner.watchlist,
          { templateId: item.templateId, name: item.name.slice(0, 120), thresholdPercent: 25 },
        ],
      },
      `${item.name} added to the wear watchlist at 25%.`,
    );
  }

  return (
    <Card as="section" className="panel mb-6 min-w-0 p-6" aria-labelledby="equipment-title">
      <h2 id="equipment-title" className="text-base">
        Equipment planner
      </h2>
      <p className="mt-3 text-sm text-sand-400">
        Private loadouts, gear checks, wear thresholds, storage rules and inventory history for your account and linked
        character. Checks read your authorized storage only; nothing is equipped, moved, repaired or reserved in game.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Button type="button" className="btn btn-ghost" disabled={saving || busy} onClick={() => void loadPlanner()}>
          Refresh plans
        </Button>
        <label className="grid gap-1 text-xs text-sand-400">
          Gear filter
          <select
            className={field}
            value={filterId}
            disabled={locked}
            onChange={(event) => {
              clearReadings();
              setFilterId(event.target.value);
            }}
          >
            <option value="">Gear reporting durability</option>
            {planner.filters.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" className="btn btn-primary" disabled={locked} onClick={() => void check()}>
          Check equipment
        </Button>
        {busy && (
          <Button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearReadings();
              setHealth((previous) => ({ ...previous, phase: 'paused' }));
              setMessage('Check cancelled. No readings retained.');
            }}
          >
            Cancel check
          </Button>
        )}
      </div>
      <p role="status" className="mt-4 break-words text-sm text-sand-400">
        {message}
      </p>
      <DataFreshness label="Equipment check freshness" health={health} />

      <div role="tablist" aria-label="Equipment tools" className="mt-5 flex flex-wrap gap-2">
        {TABS.map(([id, label]) => (
          <Button
            key={id}
            type="button"
            role="tab"
            id={`equipment-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`equipment-panel-${id}`}
            className={`min-h-11 border px-3 text-xs font-bold uppercase tracking-widest ${
              tab === id ? 'border-spice-500 bg-spice-500 text-obsidian-950' : 'border-sand-200/20 text-sand-300'
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`equipment-panel-${tab}`}
        aria-labelledby={`equipment-tab-${tab}`}
        className="mt-5 min-w-0"
      >
        {tab === 'loadouts' && (
          <LoadoutsPanel
            planner={planner}
            locked={locked}
            draft={draft}
            setDraft={setDraft}
            reading={reading}
            ticked={ticked}
            setTicked={setTicked}
            save={save}
            setMessage={setMessage}
          />
        )}
        {tab === 'gear' && (
          <section aria-label="Gear and filters" className="grid gap-5">
            <FilterEditor
              planner={planner}
              locked={locked}
              draft={filterDraft}
              setDraft={setFilterDraft}
              save={save}
              selected={filterId}
              setSelected={(id) => {
                clearReadings();
                setFilterId(id);
              }}
            />
            {!reading ? (
              <p className="text-sm">Choose a filter and select Check equipment to list matching gear.</p>
            ) : (
              <>
                <p className="text-sm text-sand-400">
                  {reading.matches.length} matching stacks for “{reading.filter.name}”
                  {reading.matchesLimited ? ' · first 200 shown' : ''}
                  {coverageComplete(reading.coverage) ? '' : ' · partial coverage'}
                </p>
                {compare.length > 0 && <Comparison items={compare} clear={() => setCompare([])} />}
                <ul className="grid min-w-0 gap-3 md:grid-cols-2" aria-label="Matching gear">
                  {reading.matches.map((item) => {
                    const chosen = compare.some((entry) => entry.id === item.id);
                    return (
                      <li key={item.id} className="min-w-0 break-words border border-sand-200/20 p-4">
                        <strong className="text-sm">{item.name}</strong>
                        <p className="mt-2 text-sm">
                          Quantity {item.quantity} · Grade {item.grade}
                        </p>
                        <p className="mt-1 text-xs text-sand-400">Durability {item.durability}</p>
                        {item.augments.length > 0 && (
                          <p className="mt-1 text-xs">Augments: {item.augments.join(', ')}</p>
                        )}
                        <p className="mt-2 text-xs text-sand-300">{item.location}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            className="btn btn-ghost"
                            aria-pressed={chosen}
                            disabled={!chosen && compare.length >= COMPARE_LIMIT}
                            onClick={() =>
                              setCompare((previous) =>
                                chosen ? previous.filter((entry) => entry.id !== item.id) : [...previous, item],
                              )
                            }
                          >
                            {chosen ? 'Remove from comparison' : 'Compare'}
                          </Button>
                          {item.templateId && (
                            <Button
                              type="button"
                              className="btn btn-ghost"
                              disabled={locked}
                              aria-label={`Watch wear for ${item.name}`}
                              onClick={() => watch(item)}
                            >
                              Watch wear
                            </Button>
                          )}
                          {item.templateId && planner.loadouts.length > 0 && (
                            <select
                              aria-label={`Add ${item.name} to a loadout`}
                              className={field}
                              disabled={locked}
                              value=""
                              onChange={(event) => event.target.value && addToLoadout(event.target.value, item)}
                            >
                              <option value="">Add to loadout…</option>
                              {planner.loadouts.map((loadout) => (
                                <option key={loadout.id} value={loadout.id}>
                                  {loadout.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <Link className="mt-3 inline-block text-sm text-spice-400 underline" href={item.href}>
                          Open source workspace
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}
        {tab === 'wear' && (
          <WearPanel planner={planner} locked={locked} reading={reading} save={save} setMessage={setMessage} />
        )}
        {tab === 'storage' && (
          <section aria-label="Storage suggestions" className="grid gap-4">
            <p className="text-sm text-sand-400">
              Rules match your own in-game container names. Suggestions require a matching label and a slot capacity the
              Console reported; containers without a reported capacity are listed as unverified, never suggested.
            </p>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (planner.storageRules.length >= STORAGE_RULE_LIMIT) {
                  setMessage(`Remove a rule before adding more than ${STORAGE_RULE_LIMIT}.`);
                  return;
                }
                void save(
                  {
                    ...planner,
                    storageRules: [
                      ...planner.storageRules,
                      {
                        id: crypto.randomUUID(),
                        containerLabel: ruleDraft.containerLabel.trim(),
                        itemText: ruleDraft.itemText.trim(),
                      },
                    ],
                  },
                  'Storage rule saved.',
                ).then((ok) => ok && setRuleDraft({ containerLabel: '', itemText: '' }));
              }}
            >
              <label className="grid gap-1 text-xs text-sand-400">
                Container label contains
                <input
                  className={field}
                  required
                  maxLength={60}
                  value={ruleDraft.containerLabel}
                  onChange={(event) => setRuleDraft({ ...ruleDraft, containerLabel: event.target.value })}
                  placeholder="Medical"
                />
              </label>
              <label className="grid gap-1 text-xs text-sand-400">
                Item name or template contains
                <input
                  className={field}
                  required
                  maxLength={128}
                  value={ruleDraft.itemText}
                  onChange={(event) => setRuleDraft({ ...ruleDraft, itemText: event.target.value })}
                  placeholder="Healkit"
                />
              </label>
              <Button type="submit" className="btn btn-primary" disabled={locked}>
                Add rule
              </Button>
            </form>
            <ul className="grid gap-2 text-sm" aria-label="Storage rules">
              {planner.storageRules.map((rule) => (
                <li key={rule.id} className="flex flex-wrap items-center gap-3 border border-sand-200/20 p-3">
                  <span className="min-w-0 flex-1 break-words">
                    “{rule.itemText}” → containers labelled “{rule.containerLabel}”
                  </span>
                  <Button
                    type="button"
                    className="btn btn-ghost"
                    disabled={locked}
                    onClick={() =>
                      void save(
                        { ...planner, storageRules: planner.storageRules.filter((entry) => entry.id !== rule.id) },
                        'Storage rule removed.',
                      )
                    }
                  >
                    Remove rule
                  </Button>
                </li>
              ))}
            </ul>
            {!reading ? (
              <p className="text-sm">Select Check equipment to match backpack items against your rules.</p>
            ) : (
              <>
                <p className="text-xs text-sand-400">
                  {reading.containers.checked} containers checked; {reading.containers.verifiedCapacity} reported an
                  exact slot capacity. Free slots are an observation and may change before you arrive.
                </p>
                {reading.storage.length === 0 && <p className="text-sm">No backpack items match your storage rules.</p>}
                <ul className="grid gap-3" aria-label="Storage destination suggestions">
                  {reading.storage.map((suggestion, index) => (
                    <li key={index} className="min-w-0 break-words border border-sand-200/20 p-4 text-sm">
                      <strong>
                        {suggestion.name} × {suggestion.quantity}
                      </strong>
                      <p className="mt-1 text-xs text-sand-400">From {suggestion.from}</p>
                      {suggestion.destinations.length === 0 ? (
                        <p className="mt-2">No matching container with verified free slots.</p>
                      ) : (
                        <ol className="mt-2 grid gap-1">
                          {suggestion.destinations.map((destination, rank) => (
                            <li key={rank}>
                              <Link className="text-spice-400 underline" href={destination.href}>
                                {destination.location}
                              </Link>{' '}
                              · {destination.freeSlots} free slots
                              {destination.holdsSame ? ' · already holds this item' : ''}
                              <span className="block text-xs text-sand-400">Rule: {destination.rule}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {suggestion.unverified.length > 0 && (
                        <p className="mt-2 text-xs text-sand-400">
                          Capacity unverified: {suggestion.unverified.map((entry) => entry.location).join('; ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        {tab === 'history' && (
          <section aria-label="Inventory change history" className="grid gap-4">
            <p className="text-sm text-sand-400">
              Record a snapshot of per-item totals from your authorized storage, then compare later snapshots. History
              starts when you record; changes are observed differences only and never identify who moved items. The
              newest six snapshots are kept for 90 days of inactivity.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                className="btn btn-primary"
                disabled={locked || !history}
                onClick={() => void historyAction('record')}
              >
                Record snapshot
              </Button>
              <Button
                type="button"
                className="btn btn-ghost"
                disabled={locked || !history?.snapshots.length}
                onClick={() => void historyAction('clear')}
              >
                Clear history
              </Button>
            </div>
            {history && history.snapshots.length === 0 && <p className="text-sm">No snapshots recorded yet.</p>}
            <ol className="grid gap-4" aria-label="Recorded snapshots">
              {history?.snapshots.map((snapshot, index) => {
                const diff = index > 0 ? history.changes[index - 1] : null;
                return (
                  <li key={snapshot.id} className="min-w-0 break-words border border-sand-200/20 p-4 text-sm">
                    <strong>{when(snapshot.takenAt)}</strong>
                    <p className="mt-1 text-xs text-sand-400">
                      {snapshot.templates} item types · {snapshot.complete ? 'complete coverage' : 'partial coverage'}
                      {snapshot.truncated ? ' · only the first 150 item types kept' : ''}
                    </p>
                    {diff && (
                      <>
                        {diff.changes.length === 0 ? (
                          <p className="mt-2">No observed change since the previous snapshot.</p>
                        ) : (
                          <ul className="mt-2 grid gap-1" aria-label={`Changes recorded ${when(snapshot.takenAt)}`}>
                            {diff.changes.map((change) => (
                              <li key={change.templateId}>
                                {change.name}: {change.before} → {change.after} ({change.delta})
                                {change.certain ? '' : ' · uncertain: partial coverage'}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>

      {reading && (
        <details className="mt-5 text-xs" open={!coverageComplete(reading.coverage)}>
          <summary className="cursor-pointer">
            Equipment check source coverage · {when(reading.coverage.startedAt)}
          </summary>
          <ul className="mt-3 grid gap-2" aria-label="Equipment source coverage">
            {reading.coverage.sources.map((source, index) => (
              <li className="break-words" key={index}>
                {source.name}: {source.status} · {new Date(source.checkedAt).toLocaleTimeString()}
                <p className="text-sand-400">{source.detail}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

type SaveFn = (planner: Planner, done: string) => Promise<boolean>;

function LoadoutsPanel({
  planner,
  locked,
  draft,
  setDraft,
  reading,
  ticked,
  setTicked,
  save,
  setMessage,
}: {
  planner: Planner;
  locked: boolean;
  draft: Loadout | null;
  setDraft: (value: Loadout | null) => void;
  reading: Reading | null;
  ticked: Set<string>;
  setTicked: (value: Set<string>) => void;
  save: SaveFn;
  setMessage: (value: string) => void;
}) {
  const [resupplyFor, setResupplyFor] = useState('');
  const existing = draft ? planner.loadouts.some((entry) => entry.id === draft.id) : false;
  const selected = reading?.readiness.find((entry) => entry.loadoutId === resupplyFor) ?? null;
  const steps = selected ? resupplyChecklist(selected) : [];
  return (
    <section aria-label="Loadouts and readiness" className="grid gap-5">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="btn btn-ghost"
          disabled={locked || planner.loadouts.length >= LOADOUT_LIMIT}
          onClick={() =>
            setDraft({ id: crypto.randomUUID(), name: '', purpose: 'harvesting', notes: '', items: [blankItem()] })
          }
        >
          New loadout
        </Button>
        <p className="self-center text-xs text-sand-400">
          Up to {LOADOUT_LIMIT} loadouts with {LOADOUT_ITEM_LIMIT} items each.
        </p>
      </div>
      {draft && (
        <form
          aria-label="Loadout editor"
          className="grid gap-3 border border-spice-500/40 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const loadouts = existing
              ? planner.loadouts.map((entry) => (entry.id === draft.id ? draft : entry))
              : [...planner.loadouts, draft];
            void save({ ...planner, loadouts }, `Loadout ${draft.name} saved.`).then((ok) => ok && setDraft(null));
          }}
        >
          <div className="flex flex-wrap gap-3">
            <label className="grid flex-1 basis-48 gap-1 text-xs text-sand-400">
              Loadout name
              <input
                className={field}
                required
                maxLength={80}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-xs text-sand-400">
              Purpose
              <select
                className={field}
                value={draft.purpose}
                onChange={(event) => setDraft({ ...draft, purpose: event.target.value as Loadout['purpose'] })}
              >
                {LOADOUT_PURPOSES.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {loadoutPurposeLabel[purpose]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-xs text-sand-400">
            Notes
            <textarea
              className="min-h-16 border border-sand-200/20 bg-obsidian-900 p-3 text-sm"
              maxLength={500}
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </label>
          <fieldset className="grid gap-3">
            <legend className="text-xs text-sand-400">
              Items. Template IDs come from finder results; leave grade or durability empty for no minimum.
            </legend>
            {draft.items.map((item, index) => {
              const update = (patch: Partial<LoadoutItem>) =>
                setDraft({
                  ...draft,
                  items: draft.items.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)),
                });
              return (
                <div key={index} className="flex flex-wrap items-end gap-2 border-t border-sand-200/10 pt-3">
                  <label className="grid flex-1 basis-40 gap-1 text-xs text-sand-400">
                    Item name
                    <input
                      className={field}
                      required
                      maxLength={120}
                      value={item.name}
                      onChange={(event) => update({ name: event.target.value })}
                    />
                  </label>
                  <label className="grid flex-1 basis-40 gap-1 text-xs text-sand-400">
                    Template ID
                    <input
                      className={field}
                      required
                      maxLength={128}
                      value={item.templateId}
                      onChange={(event) => update({ templateId: event.target.value })}
                    />
                  </label>
                  <label className="grid w-24 gap-1 text-xs text-sand-400">
                    Quantity
                    <input
                      className={field}
                      required
                      inputMode="numeric"
                      pattern="[1-9][0-9]{0,8}"
                      value={item.quantity}
                      onChange={(event) => update({ quantity: event.target.value.trim() })}
                    />
                  </label>
                  <label className="grid w-24 gap-1 text-xs text-sand-400">
                    Min grade
                    <input
                      className={field}
                      type="number"
                      min={0}
                      max={10}
                      value={item.minGrade ?? ''}
                      onChange={(event) => update({ minGrade: optionalNumber(event.target.value) })}
                    />
                  </label>
                  <label className="grid w-28 gap-1 text-xs text-sand-400">
                    Min durability %
                    <input
                      className={field}
                      type="number"
                      min={0}
                      max={100}
                      value={item.minDurabilityPercent ?? ''}
                      onChange={(event) => update({ minDurabilityPercent: optionalNumber(event.target.value) })}
                    />
                  </label>
                  <Button
                    type="button"
                    className="btn btn-ghost"
                    disabled={draft.items.length <= 1}
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() =>
                      setDraft({ ...draft, items: draft.items.filter((_, position) => position !== index) })
                    }
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="btn btn-ghost"
              disabled={draft.items.length >= LOADOUT_ITEM_LIMIT}
              onClick={() => setDraft({ ...draft, items: [...draft.items, blankItem()] })}
            >
              Add item
            </Button>
            <Button type="submit" className="btn btn-primary" disabled={locked}>
              Save loadout
            </Button>
            <Button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
              Discard changes
            </Button>
          </div>
        </form>
      )}
      {planner.loadouts.length === 0 && !draft && (
        <p className="text-sm">No loadouts yet. Create one for harvesting, combat, building or exploration.</p>
      )}
      <ul className="grid min-w-0 gap-4 lg:grid-cols-2" aria-label="Saved loadouts">
        {planner.loadouts.map((loadout) => {
          const readiness = reading?.readiness.find((entry) => entry.loadoutId === loadout.id);
          return (
            <li key={loadout.id} className="min-w-0 break-words border border-sand-200/20 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-sm">{loadout.name}</strong>
                <span className="font-mono text-xs uppercase tracking-widest text-sand-400">
                  {loadoutPurposeLabel[loadout.purpose]}
                </span>
              </div>
              {loadout.notes && <p className="mt-2 text-xs text-sand-400">{loadout.notes}</p>}
              <p className="mt-2 text-sm text-spice-400">
                {!readiness ? 'Not checked' : readiness.ready ? 'Ready' : 'Not ready'}
              </p>
              <ul className="mt-2 grid gap-2 text-xs" aria-label={`${loadout.name} readiness`}>
                {loadout.items.map((item) => {
                  const entry = readiness?.entries.find((candidate) => candidate.templateId === item.templateId);
                  return (
                    <li key={item.templateId}>
                      <span className="text-sand-100">
                        {item.name} × {item.quantity}
                      </span>
                      {item.minGrade !== null && ` · grade ≥ ${item.minGrade}`}
                      {item.minDurabilityPercent !== null && ` · durability ≥ ${item.minDurabilityPercent}%`}
                      {entry && (
                        <span className="block text-sand-400">
                          {statusLabel[entry.status]} · {entry.suitable} suitable
                          {entry.unsuitable !== '0' ? ` · ${entry.unsuitable} below requirements` : ''}
                          {entry.unverified !== '0' ? ` · ${entry.unverified} unverified` : ''}
                          {entry.reasons.length ? ` · ${entry.reasons.join(' ')}` : ''}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" className="btn btn-ghost" disabled={locked} onClick={() => setDraft(loadout)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  className="btn btn-ghost"
                  disabled={locked}
                  aria-label={`Delete ${loadout.name}`}
                  onClick={() =>
                    void save(
                      { ...planner, loadouts: planner.loadouts.filter((entry) => entry.id !== loadout.id) },
                      `Loadout ${loadout.name} deleted.`,
                    )
                  }
                >
                  Delete
                </Button>
                <Button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!readiness}
                  onClick={() => {
                    setResupplyFor(loadout.id);
                    setTicked(new Set());
                  }}
                >
                  Resupply checklist
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {selected && (
        <section aria-label="Resupply checklist" className="border border-spice-500/40 p-4">
          <h3 className="text-sm">Resupply checklist · {selected.name}</h3>
          {steps.length === 0 ? (
            <p className="mt-2 text-sm">Every item met its requirements in this check. Nothing to resupply.</p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm">
              {steps.map((step) => (
                <li key={step.templateId}>
                  <label className="flex min-h-11 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-5"
                      checked={ticked.has(step.templateId)}
                      onChange={() => {
                        const next = new Set(ticked);
                        if (next.has(step.templateId)) next.delete(step.templateId);
                        else next.add(step.templateId);
                        setTicked(next);
                      }}
                    />
                    <span className={ticked.has(step.templateId) ? 'text-sand-500 line-through' : ''}>{step.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              className="btn btn-ghost"
              disabled={!steps.length}
              onClick={() => {
                const text = [`Resupply: ${selected.name}`, ...steps.map((step) => `- [ ] ${step.text}`)].join('\n');
                navigator.clipboard?.writeText(text).then(
                  () => setMessage('Checklist copied.'),
                  () => setMessage('Copy failed. Select the checklist text instead.'),
                );
              }}
            >
              Copy checklist
            </Button>
            <Button type="button" className="btn btn-ghost" onClick={() => setResupplyFor('')}>
              Close checklist
            </Button>
          </div>
          <p className="mt-2 text-xs text-sand-400">
            Ticks are kept on this page only. The checklist is regenerated from your next equipment check.
          </p>
        </section>
      )}
    </section>
  );
}

function FilterEditor({
  planner,
  locked,
  draft,
  setDraft,
  save,
  selected,
  setSelected,
}: {
  planner: Planner;
  locked: boolean;
  draft: SavedFilter | null;
  setDraft: (value: SavedFilter | null) => void;
  save: SaveFn;
  selected: string;
  setSelected: (value: string) => void;
}) {
  const existing = draft ? planner.filters.some((entry) => entry.id === draft.id) : false;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="btn btn-ghost"
          disabled={locked || planner.filters.length >= FILTER_LIMIT}
          onClick={() => setDraft(blankFilter())}
        >
          New saved filter
        </Button>
        {planner.filters.map((filter) => (
          <span key={filter.id} className="flex flex-wrap items-center gap-1 border border-sand-200/20 px-2 text-xs">
            <Button
              type="button"
              className="min-h-11 px-2 underline"
              aria-pressed={selected === filter.id}
              onClick={() => setSelected(filter.id)}
            >
              {filter.name}
            </Button>
            <Button
              type="button"
              className="min-h-11 px-2"
              disabled={locked}
              aria-label={`Edit filter ${filter.name}`}
              onClick={() => setDraft(filter)}
            >
              Edit
            </Button>
            <Button
              type="button"
              className="min-h-11 px-2"
              disabled={locked}
              aria-label={`Delete filter ${filter.name}`}
              onClick={() => {
                if (selected === filter.id) setSelected('');
                void save(
                  { ...planner, filters: planner.filters.filter((entry) => entry.id !== filter.id) },
                  `Filter ${filter.name} deleted.`,
                );
              }}
            >
              Delete
            </Button>
          </span>
        ))}
      </div>
      {draft && (
        <form
          aria-label="Filter editor"
          className="grid gap-3 border border-spice-500/40 p-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const filters = existing
              ? planner.filters.map((entry) => (entry.id === draft.id ? draft : entry))
              : [...planner.filters, draft];
            void save({ ...planner, filters }, `Filter ${draft.name} saved.`).then((ok) => {
              if (!ok) return;
              setDraft(null);
              setSelected(draft.id);
            });
          }}
        >
          <label className="grid gap-1 text-xs text-sand-400">
            Filter name
            <input
              className={field}
              required
              maxLength={60}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs text-sand-400">
            Name or template contains
            <input
              className={field}
              maxLength={128}
              value={draft.text}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs text-sand-400">
            Equipment category
            <select
              className={field}
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value as SavedFilter['kind'] })}
            >
              {ITEM_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {itemKindLabel[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-sand-400">
            Minimum grade
            <input
              className={field}
              type="number"
              min={0}
              max={10}
              value={draft.minGrade ?? ''}
              onChange={(event) => setDraft({ ...draft, minGrade: optionalNumber(event.target.value) })}
            />
          </label>
          <label className="grid gap-1 text-xs text-sand-400">
            Maximum grade
            <input
              className={field}
              type="number"
              min={0}
              max={10}
              value={draft.maxGrade ?? ''}
              onChange={(event) => setDraft({ ...draft, maxGrade: optionalNumber(event.target.value) })}
            />
          </label>
          <label className="grid gap-1 text-xs text-sand-400">
            Augments
            <select
              className={field}
              value={draft.augments}
              onChange={(event) => setDraft({ ...draft, augments: event.target.value as SavedFilter['augments'] })}
            >
              <option value="any">Any</option>
              <option value="with">With augments</option>
              <option value="without">Without augments</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-sand-400">
            Augment contains
            <input
              className={field}
              maxLength={60}
              value={draft.augmentText}
              onChange={(event) => setDraft({ ...draft, augmentText: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs text-sand-400">
            Container location
            <select
              className={field}
              value={draft.source}
              onChange={(event) => setDraft({ ...draft, source: event.target.value as SavedFilter['source'] })}
            >
              <option value="any">Anywhere</option>
              <option value="character">Character</option>
              <option value="base">Base containers</option>
              <option value="vehicle">Vehicle cargo</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-sand-400">
            Location contains
            <input
              className={field}
              maxLength={80}
              value={draft.locationText}
              onChange={(event) => setDraft({ ...draft, locationText: event.target.value })}
            />
          </label>
          <p className="text-xs text-sand-400 sm:col-span-2 lg:col-span-3">
            Categories use reported inventory slots and durability. Items with an unknown grade never match a grade
            bound.
          </p>
          <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-3">
            <Button type="submit" className="btn btn-primary" disabled={locked}>
              Save filter
            </Button>
            <Button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
              Discard changes
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Comparison({ items, clear }: { items: FoundItem[]; clear: () => void }) {
  const rows = compareGear(items);
  return (
    <section aria-label="Gear comparison" className="min-w-0 border border-spice-500/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm">Side-by-side comparison</h3>
        <Button type="button" className="btn btn-ghost" onClick={clear}>
          Clear comparison
        </Button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead>
            <tr>
              <th scope="col" className="p-2">
                Detail
              </th>
              {items.map((item) => (
                <th key={item.id} scope="col" className="p-2 text-sand-100">
                  {item.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-sand-200/10">
                <th scope="row" className="p-2 text-sand-400">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={index} className={`break-words p-2 ${row.best.includes(index) ? 'text-spice-400' : ''}`}>
                    {value}
                    {row.best.includes(index) ? ' · highest reported' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-sand-400">
        Highlights compare reported values only. Unknown values are never ranked, and augment effects are not reported,
        so augments are listed rather than scored.
      </p>
    </section>
  );
}

function WearPanel({
  planner,
  locked,
  reading,
  save,
  setMessage,
}: {
  planner: Planner;
  locked: boolean;
  reading: Reading | null;
  save: SaveFn;
  setMessage: (value: string) => void;
}) {
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  return (
    <section aria-label="Wear watchlist" className="grid gap-4">
      <p className="text-sm text-sand-400">
        Add gear from Gear and filters with Watch wear, then choose the durability percentage that should warn you.
        Stacks without a usable durability reading are shown as unknown, never as healthy.
      </p>
      {planner.watchlist.length === 0 && <p className="text-sm">No watched gear yet.</p>}
      <ul className="grid min-w-0 gap-3 md:grid-cols-2" aria-label="Watched gear">
        {planner.watchlist.map((watch) => {
          const result = reading?.wear.find((entry) => entry.templateId === watch.templateId);
          const value = thresholds[watch.templateId] ?? String(watch.thresholdPercent);
          return (
            <li key={watch.templateId} className="min-w-0 break-words border border-sand-200/20 p-4 text-sm">
              <strong>{watch.name}</strong>
              <p className="mt-1 text-xs text-sand-400">{watch.templateId}</p>
              <form
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const threshold = Number(value);
                  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
                    setMessage('Choose a whole-number threshold from 1 to 100.');
                    return;
                  }
                  void save(
                    {
                      ...planner,
                      watchlist: planner.watchlist.map((entry) =>
                        entry.templateId === watch.templateId ? { ...entry, thresholdPercent: threshold } : entry,
                      ),
                    },
                    `${watch.name} threshold set to ${threshold}%.`,
                  );
                }}
              >
                <label className="grid gap-1 text-xs text-sand-400">
                  Warn below %
                  <input
                    className={`${field} w-24`}
                    type="number"
                    min={1}
                    max={100}
                    value={value}
                    onChange={(event) => setThresholds({ ...thresholds, [watch.templateId]: event.target.value })}
                  />
                </label>
                <Button type="submit" className="btn btn-ghost" disabled={locked}>
                  Save threshold
                </Button>
                <Button
                  type="button"
                  className="btn btn-ghost"
                  disabled={locked}
                  aria-label={`Stop watching ${watch.name}`}
                  onClick={() =>
                    void save(
                      {
                        ...planner,
                        watchlist: planner.watchlist.filter((entry) => entry.templateId !== watch.templateId),
                      },
                      `${watch.name} removed from the watchlist.`,
                    )
                  }
                >
                  Stop watching
                </Button>
              </form>
              {!result ? (
                <p className="mt-3 text-xs">Not checked</p>
              ) : result.stacks.length === 0 ? (
                <p className="mt-3 text-xs">
                  No stacks observed{reading && !coverageComplete(reading.coverage) ? ' (coverage incomplete)' : ''}.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-spice-400">
                    {result.below} below {result.thresholdPercent}% · {result.unknown} unknown
                  </p>
                  <ul className="mt-2 grid gap-1 text-xs" aria-label={`${watch.name} wear readings`}>
                    {result.stacks.map((stack, index) => (
                      <li key={index}>
                        {stack.status === 'below'
                          ? `Below threshold · ${stack.percent}%`
                          : stack.status === 'ok'
                            ? `OK · ${stack.percent}%`
                            : 'Unknown durability'}{' '}
                        · {stack.location}
                      </li>
                    ))}
                  </ul>
                  {result.limited && <p className="mt-1 text-xs text-sand-400">Showing the 20 most worn stacks.</p>}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
