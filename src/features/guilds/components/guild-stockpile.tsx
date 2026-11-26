'use client';
import { Button } from '../../../components/ui/button';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { STOCK_MEMBER_LIMIT, stockDraftSchema } from '../projects';
import type { Mutate, WorkspaceView } from '../projects';

type Stock = WorkspaceView['stockpile'][number];
type Draft = {
  revision: string | null;
  entry: Omit<Stock, 'revision' | 'ownerKey' | 'ownerName' | 'publishedAt' | 'updatedAt' | 'reserved'>;
};

/** N053: members choose which supplies to publish; nothing reads or exposes their full inventory. */
export function GuildStockpile({ view, busy, mutate }: { view: WorkspaceView; busy: boolean; mutate: Mutate }) {
  const [editor, setEditor] = useState<Draft | null>(null);
  const [filter, setFilter] = useState('');
  const own = view.stockpile.filter((entry) => entry.ownerKey === view.selfKey);
  const shown = view.stockpile.filter((entry) =>
    `${entry.material} ${entry.ownerName} ${entry.location}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  return (
    <section aria-label="Guild stockpile" className="mt-8 border-t border-sand-200/10 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base">Shared stockpile</h3>
          <p className="mt-2 max-w-prose text-sm text-sand-400">
            Supplies members chose to offer the guild. Quantities are declared by the member, not read from game
            storage, and only the listed entries are shared.
          </p>
        </div>
        <Button
          type="button"
          className="btn btn-primary"
          disabled={busy || Boolean(editor) || own.length >= STOCK_MEMBER_LIMIT}
          onClick={() =>
            setEditor({
              revision: null,
              entry: {
                id: crypto.randomUUID(),
                material: '',
                unit: 'items',
                quantity: '1',
                templateId: null,
                location: '',
                note: '',
              },
            })
          }
        >
          Publish a supply
        </Button>
      </div>
      {editor && (
        <StockForm
          initial={editor}
          busy={busy}
          onCancel={() => setEditor(null)}
          onSave={async (draft) => {
            if (await mutate({ action: 'stock-save', ...draft }, 'Supply published to the guild.')) setEditor(null);
          }}
        />
      )}
      <div className="mt-4 max-w-sm">
        <Field label="Filter supplies">
          <input value={filter} maxLength={100} onChange={(e) => setFilter(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {shown.length === 0 && <p className="mt-4 text-sm text-sand-400">No published supplies.</p>}
      <ul aria-label="Published supplies" className="mt-4 grid gap-3">
        {shown.map((entry) => {
          const mine = entry.ownerKey === view.selfKey;
          return (
            <li key={entry.id} className="min-w-0 border border-sand-200/10 p-3 text-sm text-sand-200">
              <p className="break-words font-semibold text-sand-100">
                {entry.material}: {BigInt(entry.quantity).toLocaleString()} {entry.unit}
                <span className="font-normal text-sand-400">
                  {' '}
                  · {BigInt(entry.reserved).toLocaleString()} reserved for projects
                </span>
              </p>
              <p className="mt-1 break-words text-xs text-sand-400">
                Offered by {entry.ownerName}
                {entry.location && ` · ${entry.location}`} · updated <LocalTime value={entry.updatedAt} />
              </p>
              {entry.note && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-sand-300">{entry.note}</p>}
              <div className="mt-2 flex flex-wrap gap-3">
                {mine && (
                  <Button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || Boolean(editor)}
                    onClick={() =>
                      setEditor({
                        revision: entry.revision,
                        entry: {
                          id: entry.id,
                          material: entry.material,
                          unit: entry.unit,
                          quantity: entry.quantity,
                          templateId: entry.templateId,
                          location: entry.location,
                          note: entry.note,
                        },
                      })
                    }
                  >
                    Edit supply
                  </Button>
                )}
                {(mine || view.canEdit) && (
                  <Button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        { action: 'stock-remove', stockId: entry.id, revision: entry.revision },
                        'Supply unpublished. Its planning reservations were released.',
                      )
                    }
                  >
                    Unpublish
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StockForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: Draft;
  busy: boolean;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [entry, setEntry] = useState(initial.entry);
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = stockDraftSchema.safeParse(entry);
    if (!parsed.success) {
      setError('Enter a material, unit and whole quantity within the field limits.');
      return;
    }
    setError('');
    onSave({ revision: initial.revision, entry: parsed.data });
  }
  return (
    <form
      aria-label="Published supply"
      onSubmit={submit}
      className="mt-4 grid min-w-0 grid-cols-1 gap-3 border border-sand-200/20 p-4 sm:grid-cols-3"
    >
      <FormMessage error={error} />
      <Field label="Material">
        <input
          required
          maxLength={100}
          value={entry.material}
          onChange={(e) => setEntry({ ...entry, material: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Quantity offered">
        <input
          required
          inputMode="numeric"
          maxLength={18}
          value={entry.quantity}
          onChange={(e) => setEntry({ ...entry, quantity: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Unit">
        <input
          required
          maxLength={30}
          value={entry.unit}
          onChange={(e) => setEntry({ ...entry, unit: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Where it is kept">
        <input
          maxLength={120}
          value={entry.location}
          onChange={(e) => setEntry({ ...entry, location: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Note">
        <input
          maxLength={300}
          value={entry.note}
          onChange={(e) => setEntry({ ...entry, note: e.target.value })}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Save supply
        </Button>
        <Button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
