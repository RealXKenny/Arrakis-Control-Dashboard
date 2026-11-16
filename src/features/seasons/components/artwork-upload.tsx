'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { artworkUrl, type Definition } from '../contracts';

export function ArtworkUpload({
  seasonId,
  revision,
  label,
  value,
  disabled,
  onChange,
}: {
  seasonId: string;
  revision: string;
  label: string;
  value?: Definition['artwork'];
  disabled?: boolean;
  onChange: (artwork: Definition['artwork']) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [seasonId, revision]);
  return (
    <div className="season-artwork-upload">
      <label>
        {label}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || busy || !revision}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setError('');
            setMessage('');
            if (file.size > 3 * 1024 * 1024) {
              setError('Choose an image no larger than 3 MiB.');
              return;
            }
            setBusy(true);
            const controller = new AbortController();
            request.current = controller;
            try {
              const response = await fetch(`/api/v2/admin/seasons/artwork?season=${seasonId}&revision=${revision}`, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error ?? 'Upload failed.');
              if (controller.signal.aborted) return;
              onChange({ id: result.artwork.id, alt: value?.alt || label });
              setMessage('Artwork uploaded. Save the season or live presentation to use it.');
            } catch (failure) {
              if (!controller.signal.aborted) setError(failure.message);
            } finally {
              if (!controller.signal.aborted) setBusy(false);
            }
          }}
        />
      </label>
      <p className="season-help">
        {revision
          ? 'PNG, JPEG or WebP · up to 3 MiB / 8 million pixels. Images are re-encoded; animation and metadata are removed.'
          : 'Save this draft before uploading images.'}
      </p>
      {busy && <p role="status">Validating and optimizing artwork…</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {value && (
        <>
          <Image
            className="season-artwork-preview"
            src={artworkUrl(seasonId, value.id)}
            alt={value.alt}
            width={320}
            height={180}
            unoptimized
          />
          <label>
            Alternative text for {label}
            <input
              maxLength={200}
              value={value.alt}
              disabled={disabled || busy}
              onChange={(event) => onChange({ ...value, alt: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="season-button"
            disabled={disabled || busy}
            onClick={() => onChange(undefined)}
          >
            Remove {label.toLowerCase()}
          </button>
        </>
      )}
    </div>
  );
}
