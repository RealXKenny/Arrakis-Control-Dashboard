import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { downloadBlob } from '../../../lib/ui/download';
import { exportCatalog, parseCatalog, MAX_CATALOG_BYTES } from '../catalog';
import type { Definition } from '../contracts';

export function CatalogTools({
  definition,
  editable,
  onImport,
}: {
  definition: Definition;
  editable: boolean;
  onImport: (definition: Definition) => void;
}) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  return (
    <section className="season-editor-card" aria-label="Season catalog transfer">
      <h3>Season catalog</h3>
      <p>
        Export configuration as versioned JSON. Import replaces only this unsaved draft; review, save and publish
        separately. Player records and delivery authorizations are never imported.
      </p>
      <Button
        className="season-button"
        onClick={() => {
          try {
            downloadBlob(new Blob([exportCatalog(definition)], { type: 'application/json' }), 'season-catalog.json');
            setError('');
            setNotice('Catalog exported.');
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        Export catalog
      </Button>
      <label>
        Import catalog JSON
        <input
          type="file"
          accept="application/json,.json"
          disabled={!editable || reading}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            setError('');
            setNotice('');
            setReading(true);
            try {
              if (file.size > MAX_CATALOG_BYTES) throw new Error('Catalog exceeds 200 KiB.');
              const next = parseCatalog(await file.text());
              if (!live.current) return;
              if (
                window.confirm(
                  'Replace the unsaved draft configuration with this catalog? Nothing is saved or published yet.',
                )
              ) {
                onImport(next);
                setNotice(
                  'Catalog loaded into the unsaved draft. Review its dates, artwork, objectives and fairness before saving.',
                );
              }
            } catch (e) {
              if (live.current) setError(e.message);
            } finally {
              if (live.current) setReading(false);
            }
          }}
        />
      </label>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
