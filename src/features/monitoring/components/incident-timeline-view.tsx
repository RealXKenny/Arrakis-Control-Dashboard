'use client';

import { useState } from 'react';
import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import type { IncidentTimelineData } from '../incidents';

export function IncidentTimelineView({ data }: { data: IncidentTimelineData }) {
  const [kind, setKind] = useState('all');
  const [state, setState] = useState('all');
  const entries = data.entries.filter(
    (entry) =>
      (kind === 'all' || entry.kind === kind) &&
      (state === 'all' || (entry.kind === 'observation' && entry.state === state)),
  );
  return (
    <Card as="section" className="panel mb-6 p-6" aria-labelledby="incident-timeline-heading">
      <h2 id="incident-timeline-heading" className="text-lg">
        Health and restart timeline
      </h2>
      <p className="mt-2 text-sm text-sand-400">
        Health entries are bounded probe observations, not confirmed incident causes. A gap ends observation coverage;
        only a later healthy reading establishes recovery.
      </p>
      <div className="mt-3 space-y-1 text-sm text-sand-400" role="status">
        {!data.healthAvailable && <p>Durable health observations are unavailable.</p>}
        {!data.restartsAvailable && <p>Verified restart history is unavailable.</p>}
        <p>
          Last checked <LocalTime value={data.checkedAt} />.
        </p>
      </div>
      <div className="my-4 flex flex-wrap gap-3 text-sm">
        <label>
          Entry type{' '}
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="min-h-11 border border-sand-200/20 bg-obsidian-900 px-3 text-sand-100"
          >
            <option value="all">All entries</option>
            <option value="observation">Health observations</option>
            <option value="restart">Verified restarts</option>
          </select>
        </label>
        <label>
          Observed state{' '}
          <select
            value={state}
            onChange={(event) => setState(event.target.value)}
            className="min-h-11 border border-sand-200/20 bg-obsidian-900 px-3 text-sand-100"
          >
            <option value="all">All states</option>
            <option value="degraded">Degraded</option>
            <option value="outage">Outage</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>
      {entries.length ? (
        <ul className="space-y-4">
          {entries.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`} className="border-l-2 border-spice-500/50 pl-3 text-sm">
              {entry.kind === 'restart' ? (
                <>
                  <strong>Verified restart — {entry.result === 'Succeeded' ? 'completed' : 'failed'}</strong>
                  <p>
                    {entry.target}; finished <LocalTime value={entry.finishedAt} />; duration{' '}
                    {Math.round(entry.durationSeconds)} seconds.
                  </p>
                </>
              ) : (
                <>
                  <strong>Observed {entry.state}</strong>
                  <p>
                    Started <LocalTime value={entry.startedAt} />; duration {Math.round(entry.durationSeconds)} seconds
                    {entry.ongoing ? ' and still covered by recent observations.' : '.'}
                  </p>
                  {entry.recoveredAt ? (
                    <p>
                      Healthy reading recovered the observation at <LocalTime value={entry.recoveredAt} />.
                    </p>
                  ) : (
                    !entry.ongoing && <p>Recovery is not established by the available readings.</p>
                  )}
                  <p className="text-sand-400">
                    Affected map detail:{' '}
                    {entry.affectedServices.length ? entry.affectedServices.join(', ') : 'not reported'}.
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">No health episodes or restart records match this view.</p>
      )}
    </Card>
  );
}
