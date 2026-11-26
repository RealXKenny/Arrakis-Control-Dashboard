'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../../components/ui/card';
import { Field, inputClass } from '../../../components/ui/form-controls';
import { StatePanel } from '../../../components/ui/state-panel';
import { StatusBadge } from '../../../components/ui/status-badge';
import { useSharedReading } from '../../../lib/ui/use-shared-reading';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  filterRoadmap,
  milestones,
  type RoadmapCategory,
  type RoadmapEntry,
  type RoadmapResponse,
  type RoadmapStatus,
} from '../model';

const STATUS_TONE: Record<RoadmapStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  planned: 'neutral',
  'in-progress': 'warning',
  testing: 'warning',
  released: 'success',
};

function parse(body: unknown): RoadmapResponse | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Partial<RoadmapResponse>;
  return value.ok === true &&
    value.roadmap &&
    Array.isArray(value.roadmap.entries) &&
    value.freshness &&
    typeof value.freshness.fetchedAt === 'number'
    ? (value as RoadmapResponse)
    : null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function EntryCard({ entry }: { entry: RoadmapEntry }) {
  return (
    <Card as="article" className="ui-card flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge tone={STATUS_TONE[entry.status]}>{STATUS_LABELS[entry.status]}</StatusBadge>
        <span className="border border-sand-200/15 px-2 py-0.5 font-mono uppercase tracking-widest text-sand-400">
          {CATEGORY_LABELS[entry.category]}
        </span>
        {entry.targetVersion && (
          <span className="font-mono text-spice-300" title="Confirmed target version">
            v{entry.targetVersion}
          </span>
        )}
      </div>
      <h3 className="text-base font-semibold text-sand-50">{entry.title}</h3>
      {entry.summary && <p className="text-sm leading-relaxed text-sand-300">{entry.summary}</p>}
      <p className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-sand-500">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sand-300 underline decoration-sand-500 underline-offset-4 hover:text-spice-300"
        >
          {entry.repository.split('/')[1]} #{entry.number}
          <span className="sr-only"> (opens GitHub in a new tab)</span>
        </a>
        {entry.milestone?.dueOn && entry.status !== 'released' && (
          <span title="Milestone due date set by the maintainers">Due {formatDate(entry.milestone.dueOn)}</span>
        )}
      </p>
    </Card>
  );
}

export function RoadmapBoard({ initial }: { initial: RoadmapResponse | null }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RoadmapStatus | null>(null);
  const [category, setCategory] = useState<RoadmapCategory | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const reading = useSharedReading('/api/v2/roadmap', {
    initial,
    intervalMs: Math.max(5 * 60_000, (initial?.refreshSeconds ?? 1200) * 1000),
    parse,
    initialMatchesUrl: true,
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const entries = useMemo(() => reading.data?.roadmap.entries ?? [], [reading.data]);
  const visible = useMemo(
    () => filterRoadmap(entries, { query, status, category }),
    [entries, query, status, category],
  );
  const upcoming = useMemo(() => milestones(entries), [entries]);

  if (!reading.data) {
    return reading.loading ? (
      <StatePanel kind="loading" title="Loading the roadmap…" />
    ) : (
      <StatePanel kind="error" title="The roadmap is unavailable right now" onRetry={reading.retry}>
        GitHub could not be reached and no earlier copy is stored yet. Nothing is shown rather than guessed.
      </StatePanel>
    );
  }
  const freshness = reading.data.freshness;
  const minutes = Math.max(0, Math.round((now - freshness.fetchedAt) / 60_000));
  const counts = Object.fromEntries(
    STATUS_ORDER.map((value) => [value, entries.filter((entry) => entry.status === value).length]),
  ) as Record<RoadmapStatus, number>;

  return (
    <div className="grid gap-6">
      <p className="flex flex-wrap items-center gap-3 text-xs text-sand-400" aria-live="polite">
        <StatusBadge tone={freshness.refreshFailed ? 'warning' : 'success'}>
          {freshness.refreshFailed ? 'Cached copy' : 'Synced from GitHub'}
        </StatusBadge>
        <span title={new Date(freshness.fetchedAt).toLocaleString()}>
          Last updated {minutes < 1 ? 'less than a minute' : `${minutes} minute${minutes === 1 ? '' : 's'}`} ago
          {freshness.refreshFailed ? '. GitHub is unreachable, so the last good copy is shown.' : '.'}
        </span>
      </p>

      <section aria-label="Progress summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATUS_ORDER.map((value) => (
          <Card as="div" key={value} className="ui-card p-4">
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">{STATUS_LABELS[value]}</p>
            <p className="mt-1 text-2xl font-semibold text-sand-50">{counts[value]}</p>
          </Card>
        ))}
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="milestones-heading">
          <h2 id="milestones-heading" className="mb-3 text-lg">
            Upcoming milestones
          </h2>
          <ul className="flex flex-wrap gap-3">
            {upcoming.map((milestone) => (
              <li key={milestone.version} className="border border-sand-200/15 px-3 py-2 text-sm">
                <span className="font-mono text-spice-300">v{milestone.version}</span>
                <span className="text-sand-400">
                  {' '}
                  · {milestone.count} {milestone.count === 1 ? 'item' : 'items'}
                  {milestone.dueOn ? ` · due ${formatDate(milestone.dueOn)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card as="section" className="ui-card grid gap-4 p-4 sm:grid-cols-3" aria-label="Filters">
        <Field label="Search">
          <input
            type="search"
            className={inputClass}
            value={query}
            maxLength={64}
            placeholder="Feature or version"
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <select
            className={inputClass}
            value={status ?? ''}
            onChange={(event) => setStatus((event.target.value || null) as RoadmapStatus | null)}
          >
            <option value="">All statuses</option>
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select
            className={inputClass}
            value={category ?? ''}
            onChange={(event) => setCategory((event.target.value || null) as RoadmapCategory | null)}
          >
            <option value="">All categories</option>
            {(Object.keys(CATEGORY_LABELS) as RoadmapCategory[]).map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {visible.length === 0 ? (
        <StatePanel title={entries.length ? 'No roadmap entries match these filters' : 'No roadmap entries yet'}>
          {entries.length
            ? 'Clear a filter to see more.'
            : 'Approved items appear here as soon as the maintainers add them on GitHub.'}
        </StatePanel>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((entry) => (
            <li key={entry.id}>
              <EntryCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
