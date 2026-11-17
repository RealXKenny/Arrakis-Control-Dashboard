'use client';

import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import { moderationCaseViewSchema } from '../model';

type Case = ReturnType<typeof moderationCaseViewSchema.parse>;

export function ModerationCases({ initial }: { initial: Case[] }) {
  const [cases, setCases] = useState(initial);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const visible = cases.filter(
    (record) =>
      (status === 'all' || record.status === status) &&
      (type === 'all' || record.type === type) &&
      `${record.subjectName} ${record.summary} ${record.evidence}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  function update(record: Case) {
    setCases((current) => [record, ...current.filter((item) => item.id !== record.id)]);
  }
  async function action(record: Case, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/v2/moderation/cases/${record.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const raw: unknown = await response.json();
      if (!response.ok) {
        const error = (raw as { error?: unknown })?.error;
        throw new Error(typeof error === 'string' ? error : 'The case action failed.');
      }
      update(moderationCaseViewSchema.parse((raw as { case?: unknown }).case));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The case action failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-3 text-sm" role="group" aria-label="Case filters">
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="ml-2 min-h-11 bg-obsidian-900 px-3"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>
          Type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="ml-2 min-h-11 bg-obsidian-900 px-3"
          >
            <option value="all">All types</option>
            <option value="player-report">Player reports</option>
            <option value="assistance-abuse">Assistance abuse</option>
          </select>
        </label>
        <label>
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={200}
            className="ml-2 min-h-11 bg-obsidian-900 px-3"
          />
        </label>
      </div>
      {message && (
        <p role="alert" className="mb-4 text-sm text-status-danger">
          {message}
        </p>
      )}
      <div className="space-y-5">
        {visible.map((record) => (
          <Card key={record.id} className="panel p-5" aria-label={record.subjectName}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg">{record.subjectName}</h2>
              <span className="border border-sand-200/20 px-2 py-1 text-xs">{record.status}</span>
              <span className="text-xs text-sand-400">{record.type}</span>
            </div>
            <p className="mt-2 text-sm">{record.summary}</p>
            <p className="mt-2 text-xs text-sand-400">
              Reported by {record.reporterName}; updated <LocalTime value={record.updatedAt} />.
            </p>
            {record.assigneeName && <p className="mt-2 text-sm">Assigned to {record.assigneeName}</p>}
            {record.decision && (
              <p className="mt-2 text-sm">
                Decision: {record.decision}. Reason: {record.decisionReason}
              </p>
            )}
            <details className="mt-3 text-sm">
              <summary>Evidence and case history</summary>
              <p className="mt-2 whitespace-pre-wrap break-words">{record.evidence}</p>
              <ul className="mt-3 space-y-2">
                {record.history.map((item, index) => (
                  <li key={`${item.at}:${index}`} className="text-xs text-sand-400">
                    {item.action} by {item.actorName} at <LocalTime value={item.at} />
                    {item.note ? ` — ${item.note}` : ''}
                  </li>
                ))}
              </ul>
            </details>
            <div className="mt-4 flex flex-wrap gap-2">
              {record.status === 'open' && (
                <Button
                  type="button"
                  className="btn btn-secondary min-h-11"
                  disabled={busy}
                  onClick={() => void action(record, { action: 'assign', revision: record.revision })}
                >
                  Assign to me
                </Button>
              )}
              {record.status === 'assigned' && (
                <Button
                  type="button"
                  className="btn btn-secondary min-h-11"
                  disabled={busy}
                  onClick={() => void action(record, { action: 'unassign', revision: record.revision })}
                >
                  Unassign
                </Button>
              )}
              {record.status === 'resolved' && (
                <Button
                  type="button"
                  className="btn btn-secondary min-h-11"
                  disabled={busy}
                  onClick={() => void action(record, { action: 'close', revision: record.revision })}
                >
                  Close case
                </Button>
              )}
            </div>
            {record.status === 'assigned' && (
              <form
                className="mt-4 space-y-2 border-t border-sand-200/10 pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void action(record, {
                    action: 'decide',
                    revision: record.revision,
                    decision: data.get('decision'),
                    reason: data.get('reason'),
                  });
                }}
              >
                <label className="block text-sm">
                  Decision
                  <select name="decision" className="mt-1 min-h-11 bg-obsidian-900 px-3">
                    <option value="confirmed">Confirmed</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </label>
                <label className="block text-sm">
                  Reason
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    maxLength={2000}
                    className="mt-1 w-full bg-obsidian-900 p-3"
                  />
                </label>
                <Button type="submit" className="btn btn-primary min-h-11" disabled={busy}>
                  Confirm decision
                </Button>
              </form>
            )}
          </Card>
        ))}
      </div>
      {!visible.length && <p className="text-sm text-sand-400">No cases match these filters.</p>}
    </>
  );
}
