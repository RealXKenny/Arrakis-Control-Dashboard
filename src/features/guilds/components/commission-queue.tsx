'use client';
import { Button } from '../../../components/ui/button';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { commissionDraftSchema } from '../projects';
import type { Mutate, WorkspaceView } from '../projects';

type Commission = WorkspaceView['commissions'][number];
type Step = 'accept' | 'decline' | 'claim' | 'receive' | 'dispute' | 'cancel' | 'delete';
const STATUS_TEXT: Record<Commission['status'], string> = {
  requested: 'Waiting for a crafter',
  accepted: 'Accepted, in progress',
  claimed: 'Crafter reports completion; waiting for receipt',
  received: 'Receipt confirmed by requester',
  cancelled: 'Cancelled',
};
const SUCCESS: Record<Step, string> = {
  accept: 'Commission accepted. The listed inputs are now the agreed inputs.',
  decline: 'Commission returned to the queue.',
  claim: 'Completion claimed. The requester still needs to confirm receipt.',
  receive: 'Receipt confirmed.',
  dispute: 'The crafter has been told the handover is not complete.',
  cancel: 'Commission cancelled.',
  delete: 'Commission removed.',
};

/** N057 commission queue and N058 handover receipts. */
export function CommissionQueue({ view, busy, mutate }: { view: WorkspaceView; busy: boolean; mutate: Mutate }) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const listedSelf = view.specialists.some((entry) => entry.ownerKey === view.selfKey);
  const shown = view.commissions
    .filter((entry) => ['received', 'cancelled'].includes(entry.status) === (filter === 'closed'))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <section aria-label="Crafting commissions" className="mt-8 border-t border-sand-200/10 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base">Commissions</h3>
          <p className="mt-2 max-w-prose text-sm text-sand-400">
            A crafter claiming completion is not proof of handover. A commission closes only after the requester
            confirms receipt. Items and materials are exchanged in game.
          </p>
        </div>
        <Button type="button" className="btn btn-primary" disabled={busy || creating} onClick={() => setCreating(true)}>
          Request a commission
        </Button>
      </div>
      {creating && (
        <CommissionForm
          view={view}
          busy={busy}
          onCancel={() => setCreating(false)}
          onSave={async (commission) => {
            if (await mutate({ action: 'commission-save', revision: null, commission }, 'Commission requested.'))
              setCreating(false);
          }}
        />
      )}
      <div role="group" aria-label="Commission status" className="mt-4 flex flex-wrap gap-3">
        {(['open', 'closed'] as const).map((value) => (
          <Button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={`btn ${filter === value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(value)}
          >
            {value === 'open' ? 'Open commissions' : 'Received and cancelled'}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-xs text-sand-500">
        Up to 5 open commissions per character and 100 in total. Closed commissions are removed after 90 days.
      </p>
      {shown.length === 0 && <p className="mt-4 text-sm text-sand-400">No {filter} commissions.</p>}
      <ul aria-label="Commissions" className="mt-4 grid gap-3">
        {shown.map((entry) => (
          <CommissionRow key={entry.id} entry={entry} view={view} listedSelf={listedSelf} busy={busy} mutate={mutate} />
        ))}
      </ul>
    </section>
  );
}

function CommissionRow({
  entry,
  view,
  listedSelf,
  busy,
  mutate,
}: {
  entry: Commission;
  view: WorkspaceView;
  listedSelf: boolean;
  busy: boolean;
  mutate: Mutate;
}) {
  const [note, setNote] = useState('');
  const requester = entry.requesterKey === view.selfKey;
  const crafter = entry.crafterKey === view.selfKey;
  const steps: Step[] = [];
  if (entry.status === 'requested' && !requester && (crafter || (!entry.crafterKey && listedSelf)))
    steps.push('accept');
  if (crafter && ['requested', 'accepted'].includes(entry.status)) steps.push('decline');
  if (crafter && entry.status === 'accepted') steps.push('claim');
  if (requester && entry.status === 'claimed') steps.push('receive', 'dispute');
  if ((requester || view.canEdit) && !['received', 'cancelled'].includes(entry.status)) steps.push('cancel');
  if ((requester || view.canEdit) && ['received', 'cancelled'].includes(entry.status)) steps.push('delete');
  const text: Record<Step, string> = {
    accept: 'Accept commission',
    decline: 'Decline',
    claim: 'Claim completion',
    receive: 'Confirm receipt',
    dispute: 'Not received',
    cancel: 'Cancel commission',
    delete: 'Remove record',
  };
  return (
    <li aria-label={entry.item} className="min-w-0 border border-sand-200/10 p-3 text-sm text-sand-200">
      <p className="font-mono text-xs uppercase tracking-wider text-spice-300">{STATUS_TEXT[entry.status]}</p>
      <p className="mt-1 break-words font-semibold text-sand-100">
        {BigInt(entry.quantity).toLocaleString()} × {entry.item}
      </p>
      <p className="mt-1 break-words text-xs text-sand-400">
        Requested by {entry.requesterName} · crafter: {entry.crafterName ?? 'open to listed crafters'} · updated{' '}
        <LocalTime value={entry.updatedAt} />
      </p>
      {entry.details && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-sand-300">{entry.details}</p>}
      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-sand-300">
        {entry.agreedInputs !== null
          ? `Agreed inputs: ${entry.agreedInputs || 'none listed'}`
          : `Proposed inputs: ${entry.inputs || 'none listed'}`}
      </p>
      {entry.claimedAt && (
        <p className="mt-1 break-words text-xs text-sand-300">
          Completion claimed <LocalTime value={entry.claimedAt} />
          {entry.claimNote && `: ${entry.claimNote}`}
        </p>
      )}
      {entry.receivedAt && (
        <p className="mt-1 break-words text-xs text-sand-300">
          Receipt confirmed <LocalTime value={entry.receivedAt} />
          {entry.receiptNote && `: ${entry.receiptNote}`}
        </p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-spice-300">History ({entry.events.length})</summary>
        <ol className="mt-1 grid gap-1 text-xs text-sand-400">
          {entry.events.map((event, index) => (
            <li key={`${event.at}-${index}`} className="break-words">
              <LocalTime value={event.at} /> {event.byName}: {event.event}
              {event.note && ` (${event.note})`}
            </li>
          ))}
        </ol>
      </details>
      {steps.length > 0 && (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          {steps.some((step) => ['claim', 'receive', 'dispute', 'decline'].includes(step)) && (
            <Field label="Note">
              <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
            </Field>
          )}
          {steps.map((step) => (
            <Button
              key={step}
              type="button"
              className={`btn ${step === 'accept' || step === 'receive' || step === 'claim' ? 'btn-primary' : 'btn-secondary'}`}
              disabled={busy}
              onClick={async () => {
                if (
                  await mutate(
                    { action: 'commission', commissionId: entry.id, revision: entry.revision, step, note: note.trim() },
                    SUCCESS[step],
                  )
                )
                  setNote('');
              }}
            >
              {text[step]}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

function CommissionForm({
  view,
  busy,
  onSave,
  onCancel,
}: {
  view: WorkspaceView;
  busy: boolean;
  onSave: (commission: {
    id: string;
    item: string;
    quantity: string;
    details: string;
    inputs: string;
    crafterKey: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    id: crypto.randomUUID(),
    item: '',
    quantity: '1',
    details: '',
    inputs: '',
    crafterKey: null as string | null,
  });
  const [error, setError] = useState('');
  const crafters = view.specialists.filter((entry) => entry.ownerKey !== view.selfKey);
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = commissionDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError('Enter the item and a whole quantity, keeping details within their limits.');
      return;
    }
    setError('');
    onSave({ ...parsed.data, crafterKey: parsed.data.crafterKey ?? null });
  }
  return (
    <form
      aria-label="Commission request"
      onSubmit={submit}
      className="mt-4 grid min-w-0 grid-cols-1 gap-3 border border-sand-200/20 p-4 sm:grid-cols-2"
    >
      <FormMessage error={error} />
      <Field label="Item">
        <input
          required
          maxLength={100}
          value={draft.item}
          onChange={(e) => setDraft({ ...draft, item: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Quantity">
        <input
          required
          inputMode="numeric"
          maxLength={18}
          value={draft.quantity}
          onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Crafter">
        <select
          value={draft.crafterKey ?? ''}
          onChange={(e) => setDraft({ ...draft, crafterKey: e.target.value || null })}
          className={inputClass}
        >
          <option value="">Any listed crafter</option>
          {crafters.map((entry) => (
            <option key={entry.ownerKey} value={entry.ownerKey}>
              {entry.ownerName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Inputs you will provide" hint="Becomes the agreed inputs when a crafter accepts.">
        <input
          maxLength={1000}
          value={draft.inputs}
          onChange={(e) => setDraft({ ...draft, inputs: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Details">
        <textarea
          rows={2}
          maxLength={1000}
          value={draft.details}
          onChange={(e) => setDraft({ ...draft, details: e.target.value })}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Request commission
        </Button>
        <Button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
