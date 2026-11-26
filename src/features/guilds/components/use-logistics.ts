'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import { guildRequest } from '../client-api';

export type LogisticsSectionName = 'templates' | 'availability' | 'fleet' | 'landsraad';

/**
 * Loads one guild logistics section and sends its changes. One change is in flight at a time; a
 * failed write keeps the current reading and draft so nothing is lost, and writes never retry.
 */
export function useLogistics<T>(guildId: string, section: LogisticsSectionName, schema: z.ZodType<T>, query = '') {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const pending = useRef(false);
  const url = `/api/v2/guilds/${encodeURIComponent(guildId)}/logistics`;
  const readUrl = `${url}?section=${section}${query}`;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const value = schema.parse(await guildRequest(readUrl, undefined, signal));
        if (!signal?.aborted) setData(value);
      } catch (reason) {
        if (signal?.aborted) return;
        setData(null);
        setError(reason instanceof Error && reason.message ? reason.message : 'This plan could not be loaded.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [readUrl, schema],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function run(input: unknown, success: string) {
    if (pending.current) return false;
    pending.current = true;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const value = schema.parse(await guildRequest(url, { section, input }));
      setData((current) => ({ ...(current ?? {}), ...value }) as T);
      setStatus(success);
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message
          ? reason.message
          : 'Unable to confirm the change. Refresh before trying again.',
      );
      return false;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return { data, loading, saving, error, status, reload: () => load(), run, setStatus };
}
