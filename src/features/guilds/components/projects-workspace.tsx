'use client';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FormMessage } from '../../../components/ui/form-controls';
import { guildRequest } from '../client-api';
import type { Mutate, WorkspaceView } from '../projects';
import { ProjectCard } from './project-card';
import { ProjectEditor, type ProjectEditorDraft } from './project-editor';
import { GuildStockpile } from './guild-stockpile';
import { CraftingDirectory } from './crafting-directory';
import { CommissionQueue } from './commission-queue';

function isView(value: unknown): value is WorkspaceView {
  if (!value || typeof value !== 'object') return false;
  const view = value as Record<string, unknown>;
  return (
    typeof view.canEdit === 'boolean' &&
    typeof view.selfKey === 'string' &&
    ['roster', 'projects', 'stockpile', 'specialists', 'commissions'].every((key) => Array.isArray(view[key]))
  );
}

/** N051–N060 guild workspace. Records are planning metadata; nothing here moves game items or Solari. */
export function GuildProjectsWorkspace({ guildId, section }: { guildId: string; section: 'projects' | 'crafting' }) {
  const [view, setView] = useState<WorkspaceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState<ProjectEditorDraft | null>(null);
  const pending = useRef(false);
  const url = `/api/v2/guilds/${encodeURIComponent(guildId)}/projects`;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const data: unknown = await guildRequest(url, undefined, signal);
      if (!isView(data)) throw new Error('Guild projects returned an unexpected response. Refresh to try again.');
      return data;
    },
    [url],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setView(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Guild projects could not be loaded. Refresh to try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);

  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      setView(await load());
    } catch (reason) {
      // Private readings are cleared when access can no longer be confirmed.
      setView(null);
      setError(reason instanceof Error ? reason.message : 'Unable to refresh guild projects.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  const mutate: Mutate = async (input, success) => {
    if (pending.current) return false;
    pending.current = true;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const data: unknown = await guildRequest(url, input);
      if (!isView(data)) throw new Error('Unable to confirm the change. Refresh before trying again.');
      setView(data);
      setStatus(success);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to confirm the change. Refresh before trying again.');
      return false;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const busy = loading || saving;

  return (
    <Card
      as="section"
      aria-label={section === 'projects' ? 'Guild projects' : 'Guild crafting'}
      className="panel min-w-0 p-5 sm:p-6 [&_button]:max-w-full [&_button]:whitespace-normal [&_button:disabled]:opacity-50"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg">{section === 'projects' ? 'Projects and shared supplies' : 'Crafting'}</h2>
          <p className="mt-2 max-w-prose text-sm text-sand-400">
            {section === 'projects'
              ? 'Plan guild construction, track who is supplying what, and review delivered contributions.'
              : 'Find members who have published crafting capabilities, request commissions and confirm handovers.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" className="btn btn-secondary" disabled={busy} onClick={refresh}>
            Refresh
          </Button>
          {section === 'projects' && view?.canEdit && (
            <Button
              type="button"
              className="btn btn-primary"
              disabled={busy || Boolean(editor)}
              onClick={() =>
                setEditor({
                  revision: null,
                  project: {
                    id: crypto.randomUUID(),
                    name: '',
                    summary: '',
                    status: 'planning',
                    milestones: [],
                    materials: [],
                  },
                })
              }
            >
              New project
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <FormMessage error={error} status={status} />
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-sand-400">
          Loading guild projects…
        </p>
      )}
      {view && section === 'projects' && (
        <>
          {editor && (
            <ProjectEditor
              key={editor.project.id}
              initial={editor}
              roster={view.roster}
              busy={busy}
              onSave={async (draft) => {
                if (await mutate({ action: 'project-save', ...draft }, 'Project saved.')) setEditor(null);
              }}
              onCancel={() => setEditor(null)}
            />
          )}
          {!view.requestsAvailable && (
            <p className="mt-4 text-sm text-spice-300">
              Resource requests could not be read, so linked request states are unknown right now.
            </p>
          )}
          <p className="mt-4 text-xs text-sand-500">
            Up to 15 projects. Shortage is what remains after confirmed deliveries, stockpile reservations and open
            purchase assignments. Reservations and assignments are plans only: they never lock or move game items.
          </p>
          {view.projects.length === 0 && <p className="mt-5 text-sm text-sand-400">No guild projects yet.</p>}
          <ul aria-label="Guild projects" className="mt-5 grid min-w-0 grid-cols-1 gap-5">
            {view.projects.map((project) => (
              <li key={project.id} className="min-w-0">
                <ProjectCard
                  project={project}
                  view={view}
                  guildId={guildId}
                  busy={busy}
                  editing={Boolean(editor)}
                  onEdit={() =>
                    setEditor({
                      revision: project.revision,
                      project: {
                        id: project.id,
                        name: project.name,
                        summary: project.summary,
                        status: project.status,
                        milestones: project.milestones.map(({ id, title, due, responsibleKey }) => ({
                          id,
                          title,
                          due,
                          responsibleKey,
                        })),
                        materials: project.materials.map(
                          ({ id, name, unit, required, templateId, responsibleKey }) => ({
                            id,
                            name,
                            unit,
                            required,
                            templateId,
                            responsibleKey,
                          }),
                        ),
                      },
                    })
                  }
                  mutate={mutate}
                />
              </li>
            ))}
          </ul>
          <GuildStockpile view={view} busy={busy} mutate={mutate} />
        </>
      )}
      {view && section === 'crafting' && (
        <>
          <CraftingDirectory view={view} busy={busy} mutate={mutate} />
          <CommissionQueue view={view} busy={busy} mutate={mutate} />
        </>
      )}
    </Card>
  );
}
