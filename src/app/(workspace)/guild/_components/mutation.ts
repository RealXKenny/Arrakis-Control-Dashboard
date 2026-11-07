'use client';

import { useRef, useState } from 'react';

export type Mutation = {
  busy: boolean;
  error: string;
  clearError: () => void;
  /** Sends one JSON request. Returns the response `data` on success, or null after recording the error. */
  run: (method: 'POST' | 'DELETE', url: string, body: unknown) => Promise<{ data: Record<string, unknown> } | null>;
};

/**
 * One in-flight guild mutation at a time. The Pages API enforces same-origin, leadership and
 * bounded bodies; this only sends the request and reports the server's message.
 */
export function useMutation(): Mutation {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  async function run(method: 'POST' | 'DELETE', url: string, body: unknown) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35_000),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to complete the guild change.');
      return { data: (payload.data ?? {}) as Record<string, unknown> };
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to confirm the guild change. Refresh before trying again.',
      );
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return { busy, error, clearError: () => setError(''), run };
}

export function changeNotes(data: Record<string, unknown>): string {
  return `${data.relogRequired ? ' Online players may need to relog.' : ''}${
    typeof data.warning === 'string' ? ` ${data.warning}` : ''
  }`;
}
