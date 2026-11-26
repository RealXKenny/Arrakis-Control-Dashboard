'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/form-controls';
import { baseHref, relocationProgress, type CareBase } from '../care';
import { UPKEEP_LIMITS, quantitySchema, type Relocation, type RelocationInput } from '../model';
import type { useUpkeep } from './use-upkeep';

type State = ReturnType<typeof useUpkeep>;
const blank = (): RelocationInput => ({
  id: crypto.randomUUID(),
  title: '',
  fromBaseId: null,
  destination: '',
  status: 'planning',
  packing: [],
  cargo: [],
  tasks: [],
});
const strip = ({ updatedAt: _updatedAt, ...plan }: Relocation): RelocationInput => plan;

/** N030: a private plan linking packing, cargo, destination notes and tasks. Nothing is moved automatically. */
export function Relocations({ state, bases }: { state: State; bases: CareBase[] }) {
  const record = state.record!;
  const [draft, setDraft] = useState<RelocationInput | null>(null);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={record.relocations.length >= UPKEEP_LIMITS.relocations}
          onClick={() => setDraft(blank())}
        >
          New relocation plan
        </Button>
      </div>
      {draft && (
        <Editor
          state={state}
          bases={bases}
          draft={draft}
          setDraft={setDraft}
          exists={record.relocations.some((entry) => entry.id === draft.id)}
        />
      )}
      <ul className="grid gap-4" aria-label="Relocation plans">
        {!record.relocations.length && <li className="text-sm text-sand-400">No relocation plans yet.</li>}
        {record.relocations.map((plan) => {
          const progress = relocationProgress(plan);
          const base = bases.find((entry) => entry.id === plan.fromBaseId);
          return (
            <li key={plan.id} className="min-w-0 border border-sand-200/20 p-4">
              <p className="break-words text-sm font-semibold">{plan.title}</p>
              <p className="mt-1 text-sm text-sand-300">
                {plan.status === 'planning' ? 'Planning' : plan.status === 'moving' ? 'Moving' : 'Complete'} ·{' '}
                {progress.remaining} of {progress.total} item(s) remaining
                {plan.fromBaseId && (
                  <>
                    {' · from '}
                    {base ? (
                      <Link href={baseHref(base)} className="text-spice-300 underline">
                        {base.name}
                      </Link>
                    ) : (
                      `base #${plan.fromBaseId} (not currently available)`
                    )}
                  </>
                )}
              </p>
              {plan.destination && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-sand-400">{plan.destination}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" onClick={() => setDraft(strip(plan))}>
                  Open plan
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={state.saving}
                  onClick={() =>
                    void state
                      .save({ action: 'relocation-remove', id: plan.id }, 'Relocation plan deleted.')
                      .then((ok) => ok && draft?.id === plan.id && setDraft(null))
                  }
                >
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Editor({
  state,
  bases,
  draft,
  setDraft,
  exists,
}: {
  state: State;
  bases: CareBase[];
  draft: RelocationInput;
  setDraft: (value: RelocationInput | null) => void;
  exists: boolean;
}) {
  const [packLabel, setPackLabel] = useState('');
  const [packQty, setPackQty] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [load, setLoad] = useState('');
  const [task, setTask] = useState('');
  const [error, setError] = useState('');
  const toggle = <K extends 'packing' | 'cargo' | 'tasks'>(key: K, id: string) =>
    setDraft({
      ...draft,
      [key]: draft[key].map((entry) => (entry.id === id ? { ...entry, done: !entry.done } : entry)),
    });
  const remove = <K extends 'packing' | 'cargo' | 'tasks'>(key: K, id: string) =>
    setDraft({ ...draft, [key]: draft[key].filter((entry) => entry.id !== id) });
  const progress = relocationProgress(draft);
  return (
    <Card as="section" className="panel mb-6 min-w-0 p-6" aria-labelledby="relocation-editor">
      <h2 id="relocation-editor" className="text-base">
        {exists ? 'Relocation plan' : 'New relocation plan'}
      </h2>
      <p className="mt-1 text-sm text-sand-400">
        {progress.remaining} of {progress.total} item(s) remaining. Changes are saved when you select Save plan.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Title">
          <input
            className={inputClass}
            maxLength={120}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </Field>
        <Field label="Moving from">
          <select
            className={inputClass}
            value={draft.fromBaseId ?? ''}
            onChange={(e) => setDraft({ ...draft, fromBaseId: e.target.value || null })}
          >
            <option value="">Not tied to a base</option>
            {bases.map((base) => (
              <option key={base.id} value={base.id}>
                {base.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={inputClass}
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as RelocationInput['status'] })}
          >
            <option value="planning">Planning</option>
            <option value="moving">Moving</option>
            <option value="complete">Complete</option>
          </select>
        </Field>
        <div className="sm:col-span-3">
          <Field label="Destination notes" hint="Where you are moving and what to check there.">
            <textarea
              className={inputClass}
              rows={3}
              maxLength={1000}
              value={draft.destination}
              onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold">Packing list</h3>
      <ul className="mt-2 grid gap-2" aria-label="Packing list">
        {draft.packing.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex min-w-0 flex-1 items-center gap-2 break-words">
              <input
                type="checkbox"
                className="size-4 accent-spice-500"
                checked={entry.done}
                onChange={() => toggle('packing', entry.id)}
              />
              {entry.label}
              {entry.quantity && ` × ${entry.quantity}`}
            </label>
            <Link href={`/storage?find=${encodeURIComponent(entry.label)}`} className="text-spice-300 underline">
              Find
            </Link>
            <Button type="button" onClick={() => remove('packing', entry.id)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!packLabel.trim() || (packQty && !quantitySchema.safeParse(packQty).success)) return;
          if (draft.packing.length >= UPKEEP_LIMITS.packing) return;
          setDraft({
            ...draft,
            packing: [
              ...draft.packing,
              {
                id: crypto.randomUUID(),
                label: packLabel.trim().slice(0, 120),
                quantity: packQty || null,
                done: false,
              },
            ],
          });
          setPackLabel('');
          setPackQty('');
        }}
      >
        <input
          className={inputClass}
          aria-label="Item to pack"
          maxLength={120}
          value={packLabel}
          onChange={(e) => setPackLabel(e.target.value)}
        />
        <input
          className={inputClass}
          aria-label="Quantity"
          inputMode="numeric"
          value={packQty}
          onChange={(e) => setPackQty(e.target.value.trim())}
        />
        <Button type="submit">Add item</Button>
      </form>

      <h3 className="mt-6 text-sm font-semibold">Cargo plan</h3>
      <ul className="mt-2 grid gap-2" aria-label="Cargo plan">
        {draft.cargo.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex min-w-0 flex-1 items-center gap-2 break-words">
              <input
                type="checkbox"
                className="size-4 accent-spice-500"
                checked={entry.done}
                onChange={() => toggle('cargo', entry.id)}
              />
              <strong>{entry.vehicle}</strong>
              {entry.load && `: ${entry.load}`}
            </label>
            <Link href="/vehicles" className="text-spice-300 underline">
              Vehicles
            </Link>
            <Button type="button" onClick={() => remove('cargo', entry.id)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!vehicle.trim() || draft.cargo.length >= UPKEEP_LIMITS.cargo) return;
          setDraft({
            ...draft,
            cargo: [
              ...draft.cargo,
              {
                id: crypto.randomUUID(),
                vehicle: vehicle.trim().slice(0, 80),
                load: load.trim().slice(0, 300),
                done: false,
              },
            ],
          });
          setVehicle('');
          setLoad('');
        }}
      >
        <input
          className={inputClass}
          aria-label="Vehicle"
          maxLength={80}
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
        />
        <input
          className={inputClass}
          aria-label="Planned load"
          maxLength={300}
          value={load}
          onChange={(e) => setLoad(e.target.value)}
        />
        <Button type="submit">Add trip</Button>
      </form>

      <h3 className="mt-6 text-sm font-semibold">Remaining tasks</h3>
      <ul className="mt-2 grid gap-2" aria-label="Relocation tasks">
        {draft.tasks.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex min-w-0 flex-1 items-center gap-2 break-words">
              <input
                type="checkbox"
                className="size-4 accent-spice-500"
                checked={entry.done}
                onChange={() => toggle('tasks', entry.id)}
              />
              {entry.label}
            </label>
            <Button type="button" onClick={() => remove('tasks', entry.id)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!task.trim() || draft.tasks.length >= UPKEEP_LIMITS.tasks) return;
          setDraft({
            ...draft,
            tasks: [...draft.tasks, { id: crypto.randomUUID(), label: task.trim().slice(0, 160), done: false }],
          });
          setTask('');
        }}
      >
        <input
          className={inputClass}
          aria-label="Task"
          maxLength={160}
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />
        <Button type="submit">Add task</Button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-sm text-status-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={state.saving}
          onClick={() => {
            if (!draft.title.trim()) {
              setError('Give the plan a title.');
              return;
            }
            setError('');
            void state
              .save(
                { action: 'relocation', relocation: { ...draft, title: draft.title.trim() } },
                'Relocation plan saved.',
              )
              .then((ok) => ok && setDraft(null));
          }}
        >
          Save plan
        </Button>
        <Button type="button" onClick={() => setDraft(null)}>
          Close without saving
        </Button>
      </div>
    </Card>
  );
}
