import { clearClientReadCache } from '../../../lib/client-cache';
import { useEffect, useRef, useState } from 'react';
import { MAX_BLUEPRINT_BYTES, parseBlueprint, type Blueprint } from '../schema';
import css from '../import.module.css';
export default function BaseImport() {
  const [busy, setBusy] = useState(false);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [title, setTitle] = useState(''),
    [message, setMessage] = useState('');
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
  return (
    <div className={css.panel}>
      <h2>Import Blueprint</h2>
      <p>Import a Console base-export JSON into your linked character’s backpack as a Solido tool.</p>
      <button
        disabled={!blueprint || busy}
        onClick={async () => {
          if (active.current || !blueprint) return;
          const controller = new AbortController();
          active.current = controller;
          setBusy(true);
          const timer = setTimeout(() => controller.abort(), 120000);
          try {
            const response = await fetch('/api/bases/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requestId: requestId.current, title: title || 'Blueprint', blueprint }),
              signal: controller.signal,
            });
            const body = await response.json();
            if (!response.ok) throw new Error('Import could not be confirmed. Check your backpack before retrying.');
            if (mounted.current) {
              setMessage(
                typeof body.record?.message === 'string' ? body.record.message : 'Check your backpack for delivery.',
              );
              setBlueprint(null);
              clearClientReadCache(true);
            }
          } catch {
            if (mounted.current) setMessage('Import could not be confirmed. Check your backpack before retrying.');
          } finally {
            clearTimeout(timer);
            active.current = null;
            if (mounted.current) setBusy(false);
          }
        }}
      >
        {busy ? 'Working…' : 'Import to my character'}
      </button>
      <label className={css.field}>
        Upload JSON
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            setBlueprint(null);
            setMessage('');
            if (!file) return;
            setBusy(true);
            try {
              if (file.size > MAX_BLUEPRINT_BYTES) throw new Error('Choose a file no larger than 512 KiB.');
              const parsed = parseBlueprint(JSON.parse(await file.text()));
              if (mounted.current) {
                setBlueprint(parsed);
                setTitle(file.name.replace(/\.json$/i, '').slice(0, 80));
                requestId.current = crypto.randomUUID();
              }
            } catch {
              if (mounted.current) setMessage('Invalid blueprint JSON. Choose a supported Console base export.');
            } finally {
              if (mounted.current) setBusy(false);
            }
          }}
        />
      </label>
      {blueprint && (
        <p>
          {blueprint.instances.length} building pieces · {blueprint.placeables.length} placeables
        </p>
      )}

      {message && <p role="status">{message}</p>}
    </div>
  );
}
