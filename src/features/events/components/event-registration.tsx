'use client';

import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { eventRegistrationSummarySchema, type EventRegistrationSummary } from '../registrations';

export function EventRegistration({
  eventId,
  scheduled,
  initial,
}: {
  eventId: string;
  scheduled: boolean;
  initial: EventRegistrationSummary | null;
}) {
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initial ? '' : 'Registration status is unavailable.');
  async function mutate(action: 'register' | 'cancel') {
    if (!summary || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/v2/events/${encodeURIComponent(eventId)}/registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revision: summary.revision }),
      });
      const raw: unknown = await response.json();
      if (!response.ok) {
        const error = (raw as { error?: unknown })?.error;
        throw new Error(typeof error === 'string' ? error : 'Registration could not be changed.');
      }
      const parsed = eventRegistrationSummarySchema.safeParse((raw as { registration?: unknown })?.registration);
      if (!parsed.success) throw new Error('Registration returned an invalid response. Refresh before trying again.');
      setSummary(parsed.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registration could not be changed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Event registration" className="mt-5 border-t border-sand-200/10 pt-4 text-sm">
      {summary ? (
        <>
          <p>
            {summary.registered}/{summary.capacity} registered · {summary.waiting}/{summary.waitlistCapacity} waiting
          </p>
          <p className="mt-2 text-sand-400">
            {summary.ownStatus === 'registered' && 'You are registered.'}
            {summary.ownStatus === 'waiting' &&
              `You are on the waiting list at position ${summary.ownWaitlistPosition}.`}
            {!summary.ownStatus && summary.state === 'closed' && 'Registration is closed.'}
            {!summary.ownStatus &&
              summary.state === 'waiting-list' &&
              'Attendee capacity is full; a waiting list is open.'}
            {!summary.ownStatus && summary.state === 'open' && 'Registration is open.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {summary.canRegister && (
              <Button
                type="button"
                className="btn btn-primary min-h-11"
                disabled={busy}
                onClick={() => void mutate('register')}
              >
                {summary.state === 'waiting-list' ? 'Join waiting list' : 'Register for event'}
              </Button>
            )}
            {summary.canCancel && (
              <Button
                type="button"
                className="btn btn-secondary min-h-11"
                disabled={busy}
                onClick={() => void mutate('cancel')}
              >
                {summary.ownStatus === 'waiting' ? 'Leave waiting list' : 'Cancel registration'}
              </Button>
            )}
          </div>
        </>
      ) : (
        <p>
          {scheduled
            ? 'Registration status could not be verified.'
            : 'A schedule is required before registration opens.'}
        </p>
      )}
      {message && (
        <p role="alert" className="mt-2 text-status-danger">
          {message}
        </p>
      )}
      <p className="mt-2 text-xs text-sand-500">
        Only aggregate attendance is shown; attendee identities stay private.
      </p>
    </section>
  );
}
