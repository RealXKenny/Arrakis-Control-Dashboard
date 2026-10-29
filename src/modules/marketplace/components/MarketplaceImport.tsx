import { useEffect, useRef, useState } from 'react';
import { fetchBaseModelExport } from '../../bases/utils/model-export';
import { importBlueprint, IMPORT_UNCONFIRMED } from '../../bases/utils/import-blueprint';
import { marketplaceBlueprint } from '../utils/import-layout';

export default function MarketplaceImport({ id, title }: { id: string; title: string }) {
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
    const timer = setTimeout(() => controller.abort(), 120000);
    let sending = false;
    try {
      const record = await fetchBaseModelExport(
        id,
        controller.signal,
        `/api/base-marketplace/${encodeURIComponent(id)}`,
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
      if (mounted.current)
        setMessage(
          sending
            ? IMPORT_UNCONFIRMED
            : 'This layout could not be imported. It may exceed the import limits or contain unsupported pieces.',
        );
    } finally {
      clearTimeout(timer);
      active.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        disabled={busy || submitted}
        onClick={() => void deliver()}
        className="w-full rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50"
      >
        {busy ? 'Importing…' : submitted ? 'Import submitted' : 'Import to my character'}
      </button>
      {message && (
        <p role="status" className="mt-2 text-xs leading-5 text-zinc-400">
          {message}
        </p>
      )}
    </div>
  );
}
