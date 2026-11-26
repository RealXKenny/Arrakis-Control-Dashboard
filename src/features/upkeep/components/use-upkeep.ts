'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { upkeepRecordSchema, type UpkeepAction, type UpkeepRecord } from '../model';
import type { CareBase, CareItem, WaterAnalysis, WaterSample } from '../care';

export interface UpkeepOverview {
  status: 'ok' | 'unlinked' | 'limited' | 'unavailable';
  checkedAt: string;
  observedAt?: string;
  message?: string;
  bases?: CareBase[];
  limited?: boolean;
  unsupported?: number;
  items?: CareItem[];
  water?: { baseId: string; samples: WaterSample[] | null; analysis: WaterAnalysis | null }[];
}

class UpkeepRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function upkeepFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> {
  const { timeoutMs = 15_000, signal, ...rest } = init;
  const response = await fetch(url, {
    cache: 'no-store',
    ...rest,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
  });
  let value: unknown = null;
  try {
    value = await response.json();
  } catch {
    value = null;
  }
  if (!response.ok) {
    const error = value && typeof value === 'object' && 'error' in value ? (value as { error: unknown }).error : null;
    throw new UpkeepRequestError(typeof error === 'string' ? error : 'Base upkeep request failed.', response.status);
  }
  return value;
}

const recordFrom = (value: unknown): UpkeepRecord => {
  const parsed = upkeepRecordSchema.safeParse(
    value && typeof value === 'object' ? (value as { record?: unknown }).record : null,
  );
  if (!parsed.success) throw new Error('Base upkeep plans could not be read.');
  return parsed.data;
};

export type MutationInput = UpkeepAction extends infer A
  ? A extends UpkeepAction
    ? Omit<A, 'revision'>
    : never
  : never;

/** One record per page, one save at a time, and no automatic retries for unconfirmed writes. */
export function useUpkeep() {
  const [record, setRecord] = useState<UpkeepRecord | null>(null);
  const [overview, setOverview] = useState<UpkeepOverview | null>(null);
  const [message, setMessage] = useState('Loading base upkeep…');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Due times are evaluated against the last load or save, not on every render.
  const [now, setNow] = useState(() => Date.now());
  const active = useRef<AbortController | null>(null);
  const revision = useRef<string | null>(null);

  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setOverview(null);
    setMessage('Checking your bases…');
    try {
      const value = (await upkeepFetch('/api/v2/upkeep/overview', {
        signal: controller.signal,
        timeoutMs: 30_000,
      })) as UpkeepOverview & { record: unknown };
      if (controller.signal.aborted) return;
      const next = recordFrom(value);
      revision.current = next.revision;
      setRecord(next);
      setOverview(value);
      setNow(Date.now());
      setMessage(value.status === 'ok' ? '' : (value.message ?? 'Base readings are unavailable.'));
    } catch (error) {
      if (controller.signal.aborted) return;
      setRecord(null);
      setMessage(error instanceof Error ? error.message : 'Base upkeep is unavailable.');
    } finally {
      if (active.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const hide = () => {
      // Private readings are cleared while hidden; plans reload with fresh observations on return.
      if (document.hidden) {
        active.current?.abort();
        setOverview(null);
        setLoading(false);
        setMessage('Readings paused while this page was hidden. Refresh to check again.');
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      active.current?.abort();
      document.removeEventListener('visibilitychange', hide);
    };
  }, [load]);

  const save = useCallback(
    async (action: MutationInput | { blueprintUpload: Record<string, unknown> }, done: string): Promise<boolean> => {
      if (!record) {
        setMessage('Wait for your plans to load, or refresh.');
        return false;
      }
      setSaving(true);
      setMessage('Saving…');
      try {
        const upload = 'blueprintUpload' in action;
        const next = recordFrom(
          await upkeepFetch(upload ? '/api/v2/upkeep/blueprints' : '/api/v2/upkeep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              upload
                ? { ...action.blueprintUpload, revision: revision.current }
                : { ...action, revision: revision.current },
            ),
            timeoutMs: upload ? 30_000 : 15_000,
          }),
        );
        revision.current = next.revision;
        setRecord(next);
        setNow(Date.now());
        setMessage(done);
        return true;
      } catch (error) {
        setMessage(
          `${error instanceof Error ? error.message : 'The save was not confirmed.'} Your change may not have been saved; refresh before trying again.`,
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [record],
  );

  return { record, overview, now, message, setMessage, loading, saving, load, save };
}
