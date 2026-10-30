import { importBlueprint, IMPORT_UNCONFIRMED } from '../utils/import-blueprint';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { BaseCapture } from './BaseModelViewer';
import { MAX_BLUEPRINT_BYTES, parseBlueprint, type Blueprint } from '../schema';
import css from '../import.module.css';
const BaseModelViewer = dynamic(() => import('./BaseModelViewer'), { ssr: false });
export default function BaseImport() {
  const [busy, setBusy] = useState(false);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [picture, setPicture] = useState<BaseCapture | null>(null);
  const [uploadKey, setUploadKey] = useState('');
  const settled = useCallback(() => {}, []);
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
        disabled={!blueprint || !picture || busy}
        onClick={async () => {
          if (active.current || !blueprint || !picture) return;
          const controller = new AbortController();
          active.current = controller;
          setBusy(true);
          const timer = setTimeout(() => controller.abort(), 120000);
          try {
            const message = await importBlueprint(blueprint, title, requestId.current, controller.signal);
            if (mounted.current) {
              setMessage(message);
              setBlueprint(null);
            }
          } catch {
            if (mounted.current) setMessage(IMPORT_UNCONFIRMED);
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
            setPicture(null);
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
                setUploadKey(requestId.current);
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
        <div>
          <p>
            {blueprint.instances.length} building pieces · {blueprint.placeables.length} placeables
          </p>
          <h3>Choose the front of your base</h3>
          <p>
            Orbit to the entrance, then choose “Use this front and picture”. The picture automatically fits the whole
            base.
          </p>
          <BaseModelViewer
            key={uploadKey}
            baseId="uploaded"
            baseName={title || 'Uploaded base'}
            modelData={blueprint}
            onSettled={settled}
            onCapture={setPicture}
          />
          {picture && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={picture.image}
                alt="Chosen front of uploaded base"
                width={640}
                height={360}
                style={{ maxWidth: '100%', height: 'auto' }}
              />
              <a href={picture.image} download={`${title || 'base'}-front.png`}>
                Download base picture
              </a>
              <p>
                This upload becomes a Solido tool. Once built, save its front and picture under My bases to use on its
                shared listing.
              </p>
            </div>
          )}
        </div>
      )}

      {message && <p role="status">{message}</p>}
    </div>
  );
}
