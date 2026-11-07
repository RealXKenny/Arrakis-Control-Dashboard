'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Two-step removal: the first click arms it, the second confirms. */
export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/v2/bases/marketplace/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not remove this base.');
      }
      router.replace('/bases');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove this base.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {armed ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="btn border border-status-danger bg-status-danger/15 text-sand-50"
          >
            {busy ? 'Removing…' : 'Confirm remove'}
          </button>
          <button type="button" onClick={() => setArmed(false)} disabled={busy} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className="btn btn-ghost">
          Remove listing
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      )}
    </div>
  );
}
