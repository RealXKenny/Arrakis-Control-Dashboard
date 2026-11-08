'use client';

import { useEffect, useRef, useState } from 'react';
import { IMPORT_UNCONFIRMED, importBlueprint } from '../../utils/import-blueprint';
import { fetchBaseModelExport } from '../../utils/model-export';
import { marketplaceBlueprint } from '../../marketplace/utils/import-layout';

/**
 * Deliver a marketplace layout to the member's linked character. The server re-validates the layout
 * and the linked character; this component only fetches, normalises and submits it once. A reused
 * request ID makes a retried submission idempotent.
 */
export function ImportButton({ id, title }: { id: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const requestId = useRef('');
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  async function deliver() {
    if (active.current || submitted) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage('');
    const timer = setTimeout(() => controller.abort(), 120_000);
    let sending = false;
    try {
      const record = await fetchBaseModelExport(
        id,
        controller.signal,
        `/api/v2/bases/marketplace/${encodeURIComponent(id)}`,
      );
      const blueprint = marketplaceBlueprint(record);
      requestId.current ||= crypto.randomUUID();
      sending = true;
      const result = await importBlueprint(blueprint, title, requestId.current, controller.signal);
      if (mounted.current) {
        setMessage(result);
        setSubmitted(true);
      }
    } catch {
      if (mounted.current) {
        setMessage(
          sending
            ? IMPORT_UNCONFIRMED
            : 'This layout could not be imported. It may exceed the import limits or contain unsupported pieces.',
        );
      }
    } finally {
      clearTimeout(timer);
      active.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" className="btn btn-ghost" disabled={busy || submitted} onClick={() => void deliver()}>
        {busy ? 'Importing…' : submitted ? 'Import submitted' : 'Import to my character'}
      </button>
      {message && (
        <p role="status" className="max-w-xs text-xs leading-5 text-sand-400">
          {message}
        </p>
      )}
    </div>
  );
}
