'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { FormMessage } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { guildRequest } from '../client-api';
import {
  operationsViewSchema,
  operationKindLabel,
  operationRoleLabel,
  type OperationDraft,
  type OperationInput,
  type OperationsView,
  type OperationView,
} from '../operations';
import { OperationForm } from './operation-form';

const changeViewSchema = z.object({ operation: operationsViewSchema.shape.operations.element.nullable() });

export function GuildOperationsPlanner({ guildId }: { guildId: string }) {
  const [view, setView] = useState<OperationsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming');
  const [editor, setEditor] = useState<{ draft: OperationDraft; revision: string | null } | null>(null);
  const [confirmation, setConfirmation] = useState<OperationInput | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef(false);
  const url = `/api/v2/guilds/${encodeURIComponent(guildId)}/operations`;

  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    const timer = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    guildRequest(url, undefined, controller.signal)
      .then((value: unknown) => {
        if (!controller.signal.aborted) setView(operationsViewSchema.parse(value));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('The guild operations planner could not be loaded. Refresh to try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url]);

  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError('');
    setStatus('');
    setConfirmation(null);
    try {
      const next = operationsViewSchema.parse(await guildRequest(url));
      setView(next);
      setEditor((current) =>
        current
          ? {
              ...current,
              revision:
                next.operations.find((operation) => operation.id === current.draft.id)?.revision ?? current.revision,
            }
          : null,
      );
    } catch (reason) {
      setView(null);
      setError(reason instanceof Error ? reason.message : 'Unable to refresh operations.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  async function mutate(input: OperationInput) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const { operation } = changeViewSchema.parse(await guildRequest(url, input));
      const id = input.action === 'save' ? input.operation.id : input.id;
      setView((current) =>
        current
          ? {
              ...current,
              operations: [
                ...current.operations.filter((entry) => entry.id !== id),
                ...(operation ? [operation] : []),
              ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
            }
          : null,
      );
      if (input.action === 'save' || (input.action === 'delete' && editor?.draft.id === id)) setEditor(null);
      setConfirmation(null);
      setStatus(
        input.action === 'join'
          ? 'Your role sign-up is saved.'
          : input.action === 'leave'
            ? 'You have withdrawn from this operation.'
            : 'Guild operation updated.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to confirm the change. Refresh before trying again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  function create() {
    const start = Date.now() + 3_600_000;
    setEditor({
      revision: null,
      draft: {
        id: crypto.randomUUID(),
        title: '',
        kind: 'spice-run',
        details: '',
        meetingPoint: '',
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + 7_200_000).toISOString(),
        roles: [
          { role: 'pilot', capacity: 1 },
          { role: 'scout', capacity: 2 },
          { role: 'escort', capacity: 4 },
        ],
      },
    });
  }
  function edit(operation: OperationView) {
    setEditor({
      revision: operation.revision,
      draft: {
        id: operation.id,
        title: operation.title,
        kind: operation.kind,
        details: operation.details,
        meetingPoint: operation.meetingPoint,
        startsAt: operation.startsAt,
        endsAt: operation.endsAt,
        roles: operation.roles,
      },
    });
  }
  const operations =
    view?.operations.filter(
      (operation) =>
        (operation.status === 'scheduled' && Date.parse(operation.endsAt) > now) === (filter === 'upcoming'),
    ) ?? [];
  return (
    <section
      aria-label="Guild operations planner"
      className="panel min-w-0 p-5 sm:p-6 [&_button]:max-w-full [&_button]:whitespace-normal"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg">Operations planner</h2>
          <p className="mt-2 max-w-prose text-sm text-sand-400">
            Plan guild runs, choose your role and meet your team. Sign-ups and withdrawals close when an operation
            starts.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary" disabled={loading || saving} onClick={refresh}>
            Refresh operations
          </button>
          {view?.canEdit && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading || saving || Boolean(editor)}
              onClick={create}
            >
              New operation
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <FormMessage error={error} status={status} />
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-sand-400">
          Loading operations…
        </p>
      )}
      {editor && (
        <div hidden={!view?.canEdit}>
          <OperationForm
            key={editor.draft.id}
            initial={editor.draft}
            busy={loading || saving || !view?.canEdit}
            onCancel={() => setEditor(null)}
            onSave={(operation) => mutate({ action: 'save', revision: editor.revision, operation })}
          />
        </div>
      )}
      {view && (
        <>
          <div role="group" aria-label="Operation schedule" className="mt-6 flex flex-wrap gap-3">
            {(['upcoming', 'past'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                className={`btn ${filter === value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(value)}
              >
                {value === 'upcoming' ? 'Upcoming and active' : 'Past and closed'}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-sand-500">
            Up to 20 operations and 50 role slots per run. Scheduling and sign-ups do not move currency, items or
            characters.
          </p>
          {!operations.length && (
            <p className="mt-5 text-sm text-sand-400">
              No {filter === 'upcoming' ? 'upcoming' : 'past or closed'} operations.
            </p>
          )}
          <ul aria-label="Guild operations" className="mt-5 grid min-w-0 grid-cols-1 gap-5">
            {operations.map((operation) => {
              const own = operation.signups.find((signup) => signup.isSelf);
              const open = operation.status === 'scheduled' && Date.parse(operation.startsAt) > now;
              const confirm = confirmation && 'id' in confirmation && confirmation.id === operation.id;
              return (
                <li key={operation.id} className="min-w-0 border border-sand-200/20 p-4 sm:p-5">
                  <article aria-label={operation.title}>
                    <p className="font-mono text-xs uppercase tracking-wider text-spice-300">
                      {operationKindLabel[operation.kind]} ·{' '}
                      {operation.status === 'scheduled'
                        ? Date.parse(operation.endsAt) <= now
                          ? 'Past'
                          : open
                            ? 'Scheduled'
                            : 'In progress'
                        : operation.status}
                    </p>
                    <h3 className="mt-3 break-words text-base">{operation.title}</h3>
                    <p className="mt-3 text-sm text-sand-200">
                      <LocalTime value={operation.startsAt} /> — <LocalTime value={operation.endsAt} />
                    </p>
                    <p className="mt-3 break-words text-sm text-sand-300">
                      <strong className="text-sand-100">Meet:</strong> {operation.meetingPoint}
                    </p>
                    {operation.details && (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-300">{operation.details}</p>
                    )}
                    <p className="mt-3 break-words text-xs text-sand-500">
                      Organized by {operation.organizerName} · {operation.signups.length} signed up
                    </p>
                    <ul
                      aria-label="Operation role slots"
                      className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      {operation.roles.map((slot) => {
                        const occupied = operation.signups.filter((signup) => signup.role === slot.role).length;
                        return (
                          <li key={slot.role} className="min-w-0 border border-sand-200/10 p-3">
                            <p className="text-sm text-sand-200">
                              {operationRoleLabel[slot.role]} · {occupied}/{slot.capacity}
                            </p>
                            <button
                              type="button"
                              className="btn btn-secondary mt-3"
                              disabled={
                                !open || saving || loading || own?.role === slot.role || occupied >= slot.capacity
                              }
                              onClick={() =>
                                mutate({
                                  action: 'join',
                                  id: operation.id,
                                  revision: operation.revision,
                                  role: slot.role,
                                })
                              }
                            >
                              {own?.role === slot.role
                                ? `Your role: ${operationRoleLabel[slot.role]}`
                                : `Join as ${operationRoleLabel[slot.role]}`}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {own && (
                      <button
                        type="button"
                        disabled={!open || saving || loading}
                        className="btn btn-secondary mt-4"
                        onClick={() => mutate({ action: 'leave', id: operation.id, revision: operation.revision })}
                      >
                        Withdraw sign-up
                      </button>
                    )}
                    <details className="mt-5 text-sm">
                      <summary className="cursor-pointer text-sand-200">
                        Team sign-ups ({operation.signups.length})
                      </summary>
                      <ul className="mt-3 grid gap-3">
                        {operation.signups.map((signup) => (
                          <li key={signup.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                            <span className="min-w-0 break-words text-sand-300">
                              {signup.name} · {operationRoleLabel[signup.role]}
                              {signup.isSelf ? ' · You' : ''}
                            </span>
                            {view.canEdit && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={loading || saving}
                                onClick={() =>
                                  setConfirmation({
                                    action: 'remove-signup',
                                    id: operation.id,
                                    revision: operation.revision,
                                    signupId: signup.id,
                                  })
                                }
                                aria-label={`Remove sign-up for ${signup.name}`}
                              >
                                Remove sign-up
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                    {view.canEdit && (
                      <div className="mt-5 flex flex-wrap gap-3">
                        {open && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={loading || saving || Boolean(editor)}
                            onClick={() => edit(operation)}
                          >
                            Edit operation
                          </button>
                        )}
                        {operation.status === 'scheduled' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={loading || saving}
                              onClick={() =>
                                setConfirmation({
                                  action: 'status',
                                  id: operation.id,
                                  revision: operation.revision,
                                  status: 'completed',
                                })
                              }
                            >
                              Mark completed
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={loading || saving}
                              onClick={() =>
                                setConfirmation({
                                  action: 'status',
                                  id: operation.id,
                                  revision: operation.revision,
                                  status: 'cancelled',
                                })
                              }
                            >
                              Cancel operation
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={loading || saving}
                          onClick={() =>
                            setConfirmation({ action: 'delete', id: operation.id, revision: operation.revision })
                          }
                        >
                          Remove operation
                        </button>
                      </div>
                    )}
                    {confirm && (
                      <div className="mt-4 border-l-2 border-spice-400 p-3">
                        <p className="text-sm text-sand-200">
                          Confirm{' '}
                          {confirmation.action === 'status'
                            ? confirmation.status
                            : confirmation.action === 'delete'
                              ? 'operation removal'
                              : 'sign-up removal'}
                          ?
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={loading || saving}
                            onClick={() => mutate(confirmation)}
                          >
                            Confirm change
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={saving}
                            onClick={() => setConfirmation(null)}
                          >
                            Keep current plan
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
