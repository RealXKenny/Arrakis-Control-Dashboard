'use client';
import { useState } from 'react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/form-controls';
import { prettyPieceName } from '../../bases/schema';
import { compareBlueprints } from '../care';
import { UPKEEP_LIMITS, type BlueprintRevision } from '../model';
import type { useUpkeep } from './use-upkeep';

type State = ReturnType<typeof useUpkeep>;
const MAX_FILE = 2 * 1024 * 1024;
const signed = (value: number, digits = 0) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

function Footprint({ revision }: { revision: BlueprintRevision }) {
  return (
    <svg
      viewBox="-20 -20 1040 1040"
      className="aspect-square w-full border border-sand-200/15 bg-obsidian-900"
      role="img"
      aria-label={`Top-down footprint sample of ${revision.design} ${revision.label}`}
    >
      {revision.summary.footprint.map(([x, y]) => (
        <rect key={`${x},${y}`} x={x - 8} y={y - 8} width={16} height={16} className="fill-spice-400/70" />
      ))}
    </svg>
  );
}

/** N029: private revision summaries. Only derived counts and a footprint sample are kept, never the layout file. */
export function Blueprints({ state }: { state: State }) {
  const record = state.record!;
  const [design, setDesign] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const designs = [...new Set(record.blueprints.map((entry) => entry.design))].sort();
  const before = record.blueprints.find((entry) => entry.id === left);
  const after = record.blueprints.find((entry) => entry.id === right);
  const diff = before && after ? compareBlueprints(before.summary, after.summary) : null;
  return (
    <>
      <Card as="section" className="panel mb-6 min-w-0 p-6" aria-labelledby="blueprint-form-title">
        <h2 id="blueprint-form-title" className="text-base">
          Add a blueprint revision
        </h2>
        <p className="mt-2 text-sm text-sand-400">
          Upload a base layout JSON of your own design. The dashboard keeps a private summary for comparison; keep the
          file itself. Up to {UPKEEP_LIMITS.blueprints} revisions.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!file || file.size > MAX_FILE || !design.trim() || !label.trim()) {
              setError('Enter a design name, revision label and a layout file of 2 MiB or less.');
              return;
            }
            setError('');
            void file.text().then((layout) =>
              state
                .save(
                  {
                    blueprintUpload: {
                      blueprint: {
                        id: crypto.randomUUID(),
                        design: design.trim().slice(0, 80),
                        label: label.trim().slice(0, 60),
                        description: description.trim().slice(0, 1000),
                      },
                      layout,
                    },
                  },
                  'Blueprint revision saved.',
                )
                .then((ok) => {
                  if (ok) {
                    setLabel('');
                    setDescription('');
                  }
                }),
            );
          }}
        >
          <Field label="Design name">
            <input
              className={inputClass}
              list="upkeep-designs"
              maxLength={80}
              value={design}
              onChange={(e) => setDesign(e.target.value)}
            />
            <datalist id="upkeep-designs">
              {designs.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label="Revision label">
            <input className={inputClass} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea
                className={inputClass}
                rows={3}
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Layout file (.json)">
            <input
              className={inputClass}
              type="file"
              accept="application/json,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {error}
            </p>
          )}
          <div className="sm:col-span-2">
            <Button
              type="submit"
              variant="primary"
              disabled={state.saving || record.blueprints.length >= UPKEEP_LIMITS.blueprints}
            >
              Save revision
            </Button>
          </div>
        </form>
      </Card>
      {record.blueprints.length >= 2 && (
        <Card as="section" className="panel mb-6 min-w-0 p-6" aria-labelledby="compare-title">
          <h2 id="compare-title" className="text-base">
            Compare revisions
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ['Before', left, setLeft],
              ['After', right, setRight],
            ].map(([name, value, set]) => (
              <Field key={name as string} label={name as string}>
                <select
                  className={inputClass}
                  value={value as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                >
                  <option value="">Choose a revision</option>
                  {record.blueprints.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.design} · {entry.label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {before && after && diff && (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                <Footprint revision={before} />
                <Footprint revision={after} />
              </div>
              <p className="mt-3 text-sm text-sand-300">
                Pieces {signed(diff.pieces)} · placeables {signed(diff.placeables)} · footprint{' '}
                {signed(diff.width / 100, 1)} m × {signed(diff.depth / 100, 1)} m · height{' '}
                {signed(diff.height / 100, 1)} m
              </p>
              {diff.partial && (
                <p className="mt-1 text-xs text-status-warn">
                  Minor piece types were grouped, so per-type changes may be incomplete.
                </p>
              )}
              <ul className="mt-3 grid gap-1 text-sm" aria-label="Piece type changes">
                {!diff.changes.length && (
                  <li className="text-sand-400">No piece-type count changes in the recorded summaries.</li>
                )}
                {diff.changes.slice(0, 30).map((change) => (
                  <li key={change.type} className="break-words">
                    {prettyPieceName(change.type)}: {change.before} → {change.after}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
      <ul className="grid gap-4 lg:grid-cols-2" aria-label="Blueprint revisions">
        {!record.blueprints.length && <li className="text-sm text-sand-400">No blueprint revisions yet.</li>}
        {record.blueprints.map((entry) => (
          <li key={entry.id} className="min-w-0 border border-sand-200/20 p-4">
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-4">
              <Footprint revision={entry} />
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">
                  {entry.design} · {entry.label}
                </p>
                <p className="mt-1 text-xs text-sand-400">
                  {entry.summary.pieces} pieces · {entry.summary.baseType} · {entry.summary.map} · saved{' '}
                  {new Date(entry.createdAt).toLocaleDateString()}
                </p>
                {entry.description && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-sand-300">{entry.description}</p>
                )}
                <Button
                  type="button"
                  variant="danger"
                  className="mt-3"
                  disabled={state.saving}
                  onClick={() => void state.save({ action: 'blueprint-remove', id: entry.id }, 'Revision deleted.')}
                >
                  Delete
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
