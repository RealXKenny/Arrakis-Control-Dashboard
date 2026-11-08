import { useCallback, useEffect, useState } from 'react';
import { adminCall, type AdminInput } from '../client';
import type { AdminOperation } from '../types';

/** One bounded read per input change: obsolete requests are aborted and failures never retry on their own. */
export default function useAdminQuery(operation: AdminOperation | undefined, input: AdminInput = {}, enabled = true) {
  const [state, setState] = useState<{ key: string; data?: unknown; error?: string; at?: number }>({ key: '' });
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([operation?.id, input, revision]);
  useEffect(() => {
    if (!operation || !enabled) return;
    const controller = new AbortController();
    adminCall(operation, JSON.parse(key)[1], controller.signal)
      .then((outcome) => setState({ key, data: outcome.data, at: Date.now() }))
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setState({ key, error: failure.message || 'The request failed.' });
      });
    return () => controller.abort();
  }, [key, operation, enabled]);
  const current = state.key === key;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: Boolean(operation && enabled) && !current,
    readAt: current ? state.at : undefined,
    refresh,
  };
}
