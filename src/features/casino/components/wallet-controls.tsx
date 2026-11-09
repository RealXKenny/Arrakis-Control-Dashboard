'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorBanner } from './parts';
import { CasinoError, casinoApi } from './api';

const BREAKS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
  { hours: 720, label: '30 days' },
];

/** Voluntary breaks. A break can be extended but not shortened, so it cannot be undone on impulse. */
export function WalletControls({ pausedUntil }: { pausedUntil: number | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      setConfirming(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof CasinoError ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section id="limits" aria-labelledby="limits-title" className="panel p-6">
        <h2 id="limits-title" className="eyebrow">
          Take a break
        </h2>
        <p className="mt-3 max-w-prose text-sm text-sand-300">
          Real Solaris is at stake, so you can pause play whenever you like. While paused you cannot start new rounds. A
          break can be made longer but not shorter. You can still withdraw your Solaris.
        </p>
        {pausedUntil && (
          <p role="status" className="mt-3 text-sm text-spice-300">
            Paused until {new Date(pausedUntil).toLocaleString()}.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3" role="group" aria-label="Break length">
          {BREAKS.map((option) => (
            <button
              key={option.hours}
              type="button"
              disabled={busy}
              onClick={() => setConfirming(option.hours)}
              className="btn btn-ghost disabled:opacity-50"
            >
              {option.label}
            </button>
          ))}
        </div>
        {confirming !== null && (
          <div
            role="alertdialog"
            aria-labelledby="confirm-pause"
            className="mt-4 border border-spice-400/60 bg-spice-500/10 p-4"
          >
            <p id="confirm-pause" className="text-sm text-sand-100">
              Pause play for {BREAKS.find((option) => option.hours === confirming)?.label}? You will not be able to undo
              this.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                className="btn btn-primary disabled:opacity-50"
                disabled={busy}
                onClick={() => void run(() => casinoApi.pause(confirming))}
              >
                Confirm break
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
      <ErrorBanner message={error} />
    </div>
  );
}
