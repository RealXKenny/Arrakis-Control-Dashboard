'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import { reporterCaseViewSchema } from '../model';

type Report = ReturnType<typeof reporterCaseViewSchema.parse>;

export function ReportIntake({ initial, canModerate }: { initial: Report[]; canModerate: boolean }) {
  const [reports, setReports] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/v2/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectName: data.get('subjectName'),
          summary: data.get('summary'),
          evidence: data.get('evidence'),
        }),
      });
      const raw: unknown = await response.json();
      if (!response.ok) {
        const error = (raw as { error?: unknown })?.error;
        throw new Error(typeof error === 'string' ? error : 'The report could not be submitted.');
      }
      setReports((current) => [reporterCaseViewSchema.parse((raw as { report?: unknown }).report), ...current]);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The report could not be submitted.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Card as="section" className="panel p-5" aria-label="New player report">
        <h2 className="text-lg">Submit a player report</h2>
        <p className="mt-2 text-sm text-sand-400">
          Include verifiable behavior and evidence. Reports do not trigger automatic game enforcement.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <label className="block text-sm">
            Subject
            <input name="subjectName" required maxLength={120} className="mt-1 min-h-11 w-full bg-obsidian-900 px-3" />
          </label>
          <label className="block text-sm">
            Summary
            <textarea
              name="summary"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              className="mt-1 w-full bg-obsidian-900 p-3"
            />
          </label>
          <label className="block text-sm">
            Evidence
            <textarea
              name="evidence"
              required
              minLength={10}
              maxLength={4000}
              rows={5}
              className="mt-1 w-full bg-obsidian-900 p-3"
            />
          </label>
          <Button type="submit" className="btn btn-primary min-h-11" disabled={busy}>
            Submit report
          </Button>
        </form>
        {message && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {message}
          </p>
        )}
      </Card>
      {canModerate && (
        <p className="mt-5 text-sm">
          <a href="/moderation" className="font-semibold text-spice-300 underline">
            Open moderator workspace
          </a>
        </p>
      )}
      <section aria-label="My reports" className="mt-8">
        <h2 className="text-xl">My reports</h2>
        <div className="mt-4 space-y-3">
          {reports.map((report) => (
            <Card key={report.id} className="panel p-4" aria-label={report.subjectName}>
              <h3 className="text-base">{report.subjectName}</h3>
              <p className="mt-2 text-sm">{report.summary}</p>
              <p className="mt-2 text-xs text-sand-400">
                {report.status}; {report.decision ?? 'no decision yet'}; updated <LocalTime value={report.updatedAt} />.
              </p>
            </Card>
          ))}
          {!reports.length && <p className="text-sm text-sand-400">You have not submitted any reports.</p>}
        </div>
      </section>
    </>
  );
}
