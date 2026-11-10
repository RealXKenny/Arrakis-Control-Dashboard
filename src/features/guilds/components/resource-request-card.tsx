'use client';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import {
  resourceProgress,
  resourceQuantitySchema,
  type ResourceInput,
  type ResourceRequestView,
} from '../resource-requests';

const amount = (value: string) => BigInt(value).toLocaleString();
export function ResourceRequestCard({
  request,
  canEdit,
  busy,
  editing,
  onEdit,
  onMutate,
  onConfirm,
}: {
  request: ResourceRequestView;
  canEdit: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onMutate: (input: ResourceInput) => void;
  onConfirm: (input: ResourceInput, message: string) => void;
}) {
  const progress = resourceProgress(request);
  const own = request.pledges.find((pledge) => pledge.isSelf && pledge.status !== 'confirmed');
  const manager = request.isRequester || canEdit;
  const open = request.status === 'open';
  const [quantity, setQuantity] = useState(own?.quantity ?? (progress.unpledged === '0' ? '1' : progress.unpledged));
  const [error, setError] = useState('');
  const target = { id: request.id, revision: request.revision };
  function pledge(event: FormEvent) {
    event.preventDefault();
    const parsed = resourceQuantitySchema.safeParse(quantity);
    if (!parsed.success) {
      setError('Enter a positive whole quantity, without commas, of up to 18 digits.');
      return;
    }
    setError('');
    onMutate({ action: 'pledge', ...target, quantity: parsed.data });
  }
  return (
    <article aria-label={request.material} className="min-w-0 border border-sand-200/20 p-4 sm:p-5">
      <p className="font-mono text-xs uppercase tracking-wider text-spice-300">
        {request.priority} · {request.status}
      </p>
      <h3 className="mt-3 break-words text-base">{request.material}</h3>
      <p className="mt-3 break-words text-sm text-sand-200">
        Requested: {amount(request.quantity)} {request.unit}
      </p>
      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0 border-l-2 border-spice-400 p-3">
          <dt className="text-xs text-sand-400">Confirmed delivered</dt>
          <dd className="mt-2 break-words text-sm font-bold text-sand-100">
            {amount(progress.delivered)} / {amount(request.quantity)} {request.unit}
          </dd>
        </div>
        <div className="min-w-0 border border-sand-200/10 p-3">
          <dt className="text-xs text-sand-400">Covered by pledges, including deliveries</dt>
          <dd className="mt-2 break-words text-sm text-sand-200">
            {amount(progress.committed)} / {amount(request.quantity)} {request.unit}
          </dd>
        </div>
      </dl>
      <p className="mt-4 break-words text-sm text-sand-300">
        <strong className="text-sand-100">Drop-off:</strong> {request.dropoff}
      </p>
      {request.details && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-300">{request.details}</p>
      )}
      <p className="mt-3 break-words text-xs text-sand-500">
        Requested by {request.requesterName}
        {request.isRequester ? ' · You' : ''} · <LocalTime value={request.createdAt} />
      </p>
      {open && progress.unpledged === '0' && (
        <p className="mt-4 text-sm text-spice-300">Fully pledged — delivery pending.</p>
      )}
      {open && !request.isRequester && (!own || own.status === 'promised') && (own || progress.unpledged !== '0') && (
        <form
          aria-label={`Pledge ${request.material}`}
          onSubmit={pledge}
          className="mt-5 grid min-w-0 grid-cols-1 gap-3"
        >
          <FormMessage error={error} />
          <Field label="Quantity to supply">
            <input
              required
              inputMode="numeric"
              pattern="[1-9][0-9]{0,17}"
              maxLength={18}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={`${inputClass} max-w-xs`}
            />
          </Field>
          <button type="submit" disabled={busy} className="btn btn-primary justify-self-start">
            {own ? 'Update my pledge' : 'Volunteer to supply'}
          </button>
        </form>
      )}
      {open && own?.status === 'promised' && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            className="btn btn-secondary"
            onClick={() =>
              onConfirm(
                { action: 'report', ...target },
                `Report delivery of your ${amount(own.quantity)} ${request.unit}? The requester or a leader must confirm receipt.`,
              )
            }
          >
            Report delivery
          </button>
          <button
            type="button"
            disabled={busy}
            className="btn btn-secondary"
            onClick={() => onMutate({ action: 'withdraw', ...target })}
          >
            Withdraw my pledge
          </button>
        </div>
      )}
      {open && own?.status === 'reported' && (
        <p className="mt-4 text-sm text-sand-300">
          Your delivery is awaiting confirmation. Ask the requester or a different leader to review it.
        </p>
      )}
      <details className="mt-5 text-sm">
        <summary className="cursor-pointer text-sand-200">Pledges and deliveries ({request.pledges.length})</summary>
        <ul className="mt-4 grid min-w-0 grid-cols-1 gap-4">
          {request.pledges.map((entry) => (
            <li key={entry.id} className="min-w-0 border border-sand-200/10 p-3">
              <p className="break-words text-sand-200">
                {entry.name}
                {entry.isSelf ? ' · You' : ''} · {amount(entry.quantity)} {request.unit}
              </p>
              <p className="mt-2 text-xs text-sand-400">
                {entry.status === 'promised'
                  ? 'Promised'
                  : entry.status === 'reported'
                    ? 'Delivery reported — awaiting review'
                    : 'Delivery confirmed'}
              </p>
              {entry.confirmedAt && (
                <p className="mt-2 break-words text-xs text-sand-500">
                  Confirmed by {entry.confirmedByName} · <LocalTime value={entry.confirmedAt} />
                </p>
              )}
              {open && manager && entry.status !== 'confirmed' && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {entry.status === 'reported' && (
                    <>
                      {!entry.isSelf && (
                        <button
                          type="button"
                          disabled={busy}
                          className="btn btn-primary"
                          onClick={() =>
                            onConfirm(
                              { action: 'confirm', ...target, pledgeId: entry.id },
                              `Confirm actual receipt of ${amount(entry.quantity)} ${request.unit} from ${entry.name}? Confirmed deliveries stay recorded.`,
                            )
                          }
                          aria-label={`Confirm receipt from ${entry.name}`}
                        >
                          Confirm receipt
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        className="btn btn-secondary"
                        onClick={() => onMutate({ action: 'return-claim', ...target, pledgeId: entry.id })}
                        aria-label={`Return delivery from ${entry.name}`}
                      >
                        Return to promised
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    className="btn btn-secondary"
                    onClick={() =>
                      onConfirm(
                        { action: 'release-pledge', ...target, pledgeId: entry.id },
                        `Release the pledge from ${entry.name}? This clears its reserved quantity without moving resources.`,
                      )
                    }
                    aria-label={`Release pledge from ${entry.name}`}
                  >
                    Release pledge
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </details>
      {manager && (
        <div className="mt-5 flex flex-wrap gap-3">
          {open && (
            <>
              <button type="button" disabled={busy || editing} className="btn btn-secondary" onClick={onEdit}>
                Edit request
              </button>
              <button
                type="button"
                disabled={busy}
                className="btn btn-secondary"
                onClick={() =>
                  onConfirm({ action: 'cancel', ...target }, 'Cancel this request and close its outstanding pledges?')
                }
              >
                Cancel request
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            className="btn btn-secondary"
            onClick={() =>
              onConfirm(
                { action: 'delete', ...target },
                'Remove this request and its coordination history? This does not move resources.',
              )
            }
          >
            Remove request
          </button>
        </div>
      )}
    </article>
  );
}
