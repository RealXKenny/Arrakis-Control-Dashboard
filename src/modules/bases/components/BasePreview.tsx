import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { getBaseId, getBaseName } from '../../portal/utils/bases';
import css from '../preview.module.css';

const BaseModelViewer = dynamic(() => import('./BaseModelViewer'), {
  ssr: false,
  loading: () => (
    <div className={css.placeholder} role="status">
      Preparing 3D viewer…
    </div>
  ),
});

/** A single opt-in context: opening Bases does not download private exports or allocate a renderer. */
export default function BasePreview({ bases }: { bases: Record<string, unknown>[] }) {
  const options = useMemo(
    () => [
      ...new Map(
        bases.flatMap((base, index) => {
          const id = getBaseId(base);
          if (id == null || !String(id) || String(id).length > 128) return [];
          return [[String(id), { id: String(id), name: String(getBaseName(base, index)) }] as const];
        }),
      ).values(),
    ],
    [bases],
  );
  const [choice, setChoice] = useState('');
  const selected = options.find((base) => base.id === choice) ?? options[0];
  const [request, setRequest] = useState<{ id: string; revision: number } | null>(null);
  const active = options.find((base) => base.id === request?.id);
  const [loading, setLoading] = useState(false);
  const settled = useCallback(() => setLoading(false), []);
  return (
    <section className={css.panel} aria-label="3D base preview">
      <header className={css.header}>
        <div>
          <p className={css.eyebrow}>Your structures</p>
          <h2>3D base preview</h2>
          <p>Orbit your base and inspect its building pieces.</p>
        </div>
        <div className={css.actions}>
          <label>
            <span>Base</span>
            <select
              aria-label="Base for 3D preview"
              value={selected?.id ?? ''}
              disabled={!options.length}
              onChange={(event) => {
                setChoice(event.target.value);
                setRequest(null);
                setLoading(false);
              }}
            >
              {!options.length && <option value="">No owned bases</option>}
              {options.map((base) => (
                <option key={base.id} value={base.id}>
                  {base.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selected || loading}
            onClick={() => {
              if (selected) {
                setLoading(true);
                setRequest((current) => ({ id: selected.id, revision: (current?.revision ?? 0) + 1 }));
              }
            }}
          >
            {loading ? 'Loading preview…' : active ? 'Reload preview' : 'Load 3D preview'}
          </button>
          {active && (
            <button
              type="button"
              onClick={() => {
                setRequest(null);
                setLoading(false);
              }}
            >
              Close preview
            </button>
          )}
        </div>
      </header>
      {active && request ? (
        <BaseModelViewer
          key={`${request.id}:${request.revision}`}
          baseId={active.id}
          baseName={active.name}
          onSettled={settled}
        />
      ) : (
        <div className={css.placeholder}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m8 15 16-8 16 8v18l-16 8-16-8z M8 15l16 8 16-8 M24 23v18" />
          </svg>
          <strong>{options.length ? 'Explore your base in 3D' : 'No owned bases to preview'}</strong>
          <span>
            {options.length
              ? 'Choose a base, then load its preview.'
              : 'An owned base is required for a structure preview.'}
          </span>
        </div>
      )}
    </section>
  );
}
