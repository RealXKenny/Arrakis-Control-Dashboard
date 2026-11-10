'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { BASE_LAYOUT_MAX_BYTES, BASE_THUMBNAIL_MAX_BYTES } from '../schema';

const FIELD =
  'w-full border border-sand-200/20 bg-obsidian-900 px-3 py-3 text-sm font-normal normal-case tracking-normal text-sand-50 placeholder:text-sand-600';
const LABEL =
  'grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-1.5 wrap-anywhere text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-sand-400 sm:tracking-[0.2em]';
const FILE =
  'w-full min-w-0 max-w-full border border-dashed border-sand-200/25 bg-obsidian-900 p-3 text-xs font-normal normal-case tracking-normal text-sand-200 file:mr-1 file:border-0 file:bg-spice-500 file:px-2 file:py-2 file:font-bold file:uppercase file:tracking-[0.08em] file:text-obsidian-950 sm:text-sm sm:file:mr-4 sm:file:px-4 sm:file:tracking-[0.2em]';

export function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const layout = data.get('file');
    const picture = data.get('thumbnail');

    // Friendly pre-checks only. The server re-validates everything and is the authority.
    if (!(layout instanceof File) || layout.size === 0) return setError('Choose a base layout .json file.');
    if (layout.size > BASE_LAYOUT_MAX_BYTES) return setError('The layout file exceeds the 2 MiB limit.');
    if (picture instanceof File && picture.size > BASE_THUMBNAIL_MAX_BYTES) {
      return setError('The picture exceeds the 700 KiB limit.');
    }

    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/v2/bases/marketplace', { method: 'POST', body: data });
      const body = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!response.ok || !body?.id) throw new Error(body?.error ?? 'The upload failed. Try again.');
      router.push(`/bases/${body.id}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The upload failed. Try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 p-6 sm:p-8" aria-busy={busy}>
      <label className={LABEL}>
        Base layout (.json)
        <input type="file" name="file" accept="application/json,.json" required className={FILE} />
      </label>
      <label className={LABEL}>
        Title
        <input
          type="text"
          name="title"
          maxLength={120}
          placeholder="Defaults to the name inside the file"
          className={FIELD}
        />
      </label>
      <label className={LABEL}>
        Description
        <textarea
          name="description"
          maxLength={500}
          rows={4}
          placeholder="What makes this base worth building?"
          className={FIELD}
        />
      </label>
      <label className={LABEL}>
        Picture (optional, PNG, JPEG or WebP)
        <input type="file" name="thumbnail" accept="image/png,image/jpeg,image/webp" className={FILE} />
      </label>

      {error && (
        <p role="alert" className="border-l-4 border-status-danger bg-status-danger/10 p-3 text-sm text-sand-100">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-60">
          {busy ? 'Publishing…' : 'Publish to marketplace'}
        </button>
        <p className="text-xs text-sand-500">Everyone signed in can view and download what you publish.</p>
      </div>
    </form>
  );
}
