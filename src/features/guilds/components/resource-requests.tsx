'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { FormMessage } from '../../../components/ui/form-controls';
import { guildRequest } from '../client-api';
import {
  resourceRequestViewSchema,
  resourceRequestsViewSchema,
  type ResourceDraft,
  type ResourceInput,
  type ResourceRequestsView,
  type ResourceRequestView,
} from '../resource-requests';
import { ResourceRequestForm } from './resource-request-form';
import { ResourceRequestCard } from './resource-request-card';

const changedView = z.object({ request: resourceRequestViewSchema.nullable() });
export function GuildResourceRequests({ guildId }: { guildId: string }) {
  const [view, setView] = useState<ResourceRequestsView | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const [editor, setEditor] = useState<{ draft: ResourceDraft; revision: string | null } | null>(null);
  const [confirmation, setConfirmation] = useState<{ input: ResourceInput; message: string } | null>(null);
  const pending = useRef(false);
  const url = `/api/v2/guilds/${encodeURIComponent(guildId)}/resource-requests`;
  useEffect(() => {
    const controller = new AbortController();
    guildRequest(url, undefined, controller.signal)
      .then((value: unknown) => {
        if (!controller.signal.aborted) {
          setView(resourceRequestsViewSchema.parse(value));
          setVerified(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Guild resource requests could not be loaded. Refresh to try again.');
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
      const next = resourceRequestsViewSchema.parse(await guildRequest(url));
      setView(next);
      setVerified(true);
      setEditor((current) =>
        current
          ? {
              ...current,
              revision: next.requests.find((request) => request.id === current.draft.id)?.revision ?? current.revision,
            }
          : null,
      );
    } catch (reason) {
      setVerified(false);
      setError(reason instanceof Error ? reason.message : 'Unable to refresh resource requests.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  async function mutate(input: ResourceInput) {
    if (pending.current || !verified) return;
    pending.current = true;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const { request } = changedView.parse(await guildRequest(url, input));
      const id = input.action === 'save' ? input.request.id : input.id;
      setView((current) =>
        current
          ? {
              ...current,
              requests: [...current.requests.filter((entry) => entry.id !== id), ...(request ? [request] : [])].sort(
                (a, b) =>
                  Number(b.priority === 'urgent') - Number(a.priority === 'urgent') ||
                  b.createdAt.localeCompare(a.createdAt),
              ),
            }
          : null,
      );
      if (input.action === 'save' || (input.action === 'delete' && editor?.draft.id === id)) setEditor(null);
      setConfirmation(null);
      if (request && request.status !== 'open') setFilter('closed');
      setStatus(
        input.action === 'report'
          ? 'Delivery reported. It still needs receipt confirmation.'
          : input.action === 'confirm'
            ? 'Delivery receipt confirmed.'
            : input.action === 'pledge'
              ? 'Your resource pledge is saved.'
              : input.action === 'withdraw'
                ? 'Your pledge has been withdrawn.'
                : 'Resource request updated.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to confirm the change. Refresh before trying again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  function create() {
    setEditor({
      revision: null,
      draft: {
        id: crypto.randomUUID(),
        material: '',
        quantity: '1',
        unit: 'items',
        dropoff: '',
        details: '',
        priority: 'normal',
      },
    });
  }
  function edit(request: ResourceRequestView) {
    setEditor({
      revision: request.revision,
      draft: {
        id: request.id,
        material: request.material,
        quantity: request.quantity,
        unit: request.unit,
        dropoff: request.dropoff,
        details: request.details,
        priority: request.priority,
      },
    });
  }
  const edited = view?.requests.find((request) => request.id === editor?.draft.id);
  const canEditDraft = verified && (!editor?.revision || edited?.isRequester || view?.canEdit);
  return (
    <section
      aria-label="Guild resource requests"
      className="panel min-w-0 p-5 sm:p-6 [&_button]:max-w-full [&_button]:whitespace-normal [&_button:disabled]:opacity-50"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg">Resource requests</h2>
          <p className="mt-2 max-w-prose text-sm text-sand-400">
            Ask guildmates for materials, volunteer to supply them, and confirm delivery after resources arrive in game.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary" disabled={loading || saving} onClick={refresh}>
            Refresh requests
          </button>
          {view && verified && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading || saving || Boolean(editor)}
              onClick={create}
            >
              New resource request
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <FormMessage error={error} status={status} />
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-sand-400">
          Loading resource requests…
        </p>
      )}
      {editor && (
        <div hidden={!canEditDraft}>
          <ResourceRequestForm
            key={editor.draft.id}
            initial={editor.draft}
            materialLocked={Boolean(edited?.pledges.length)}
            busy={loading || saving || !canEditDraft}
            onSave={(request) => mutate({ action: 'save', revision: editor.revision, request })}
            onCancel={() => setEditor(null)}
          />
        </div>
      )}
      {view && (
        <div hidden={!verified}>
          <div role="group" aria-label="Resource request status" className="mt-6 flex flex-wrap gap-3">
            {(['open', 'closed'] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                className={`btn ${filter === value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(value)}
              >
                {value === 'open' ? 'Open requests' : 'Completed and cancelled'}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-sand-500">
            Up to 5 open requests per character, 20 requests per guild and 20 pledge/delivery records per request.
            Reporting delivery does not confirm receipt. Resources and currency are never transferred by this tracker.
          </p>
          {confirmation && (
            <div role="region" aria-label="Confirm resource change" className="mt-5 border-l-2 border-spice-400 p-4">
              <p className="break-words text-sm text-sand-200">{confirmation.message}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading || saving}
                  onClick={() => mutate(confirmation.input)}
                >
                  Confirm change
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setConfirmation(null)}
                >
                  Keep current request
                </button>
              </div>
            </div>
          )}
          {!view.requests.some((request) => (request.status === 'open') === (filter === 'open')) && (
            <p className="mt-5 text-sm text-sand-400">
              No {filter === 'open' ? 'open' : 'completed or cancelled'} requests.
            </p>
          )}
          <ul aria-label="Resource requests" className="mt-5 grid min-w-0 grid-cols-1 gap-5">
            {view.requests.map((request) => (
              <li key={request.id} hidden={(request.status === 'open') !== (filter === 'open')} className="min-w-0">
                <ResourceRequestCard
                  request={request}
                  canEdit={view.canEdit}
                  busy={loading || saving}
                  editing={Boolean(editor)}
                  onEdit={() => edit(request)}
                  onMutate={mutate}
                  onConfirm={(input, message) => setConfirmation({ input, message })}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
