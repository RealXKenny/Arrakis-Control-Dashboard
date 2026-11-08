'use client';

import Image from 'next/image';
import { useState } from 'react';
import { guildInitials } from '../details';
import { logoProblem } from '../logo';
import { FormMessage } from '../../../components/ui/form-controls';

/** Guild emblem. Leaders can replace it; the server re-checks leadership, PNG signature and size. */
export function GuildEmblem({
  guildId,
  guildName,
  editable,
}: {
  guildId: string;
  guildName: string;
  editable: boolean;
}) {
  const [version, setVersion] = useState(0);
  const [missing, setMissing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function upload(file: File) {
    const problem = logoProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(true);
    setError('');
    setStatus('');
    try {
      const logo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read')));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
      });
      const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to save logo');
      setMissing(false);
      setVersion(Date.now());
      setStatus('Guild logo saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save guild logo.');
    } finally {
      setUploading(false);
    }
  }

  const emblem = missing ? (
    <span aria-hidden="true" className="flex size-full items-center justify-center font-mono text-2xl text-spice-300">
      {guildInitials(guildName)}
    </span>
  ) : (
    <Image
      src={`/api/guilds/${encodeURIComponent(guildId)}/logo?image=1${version ? `&v=${version}` : ''}`}
      alt={`${guildName} logo`}
      width={96}
      height={96}
      unoptimized
      onError={() => setMissing(true)}
      className="size-full object-contain"
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {editable ? (
        <label
          title="Upload guild logo"
          className="group relative block size-24 shrink-0 cursor-pointer overflow-hidden border border-sand-200/20 bg-obsidian-900 focus-within:border-spice-400"
        >
          {emblem}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 bg-obsidian-950/85 py-1 text-center font-mono text-[0.625rem] uppercase tracking-widest text-spice-300 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {uploading ? 'Saving…' : 'Upload PNG'}
          </span>
          <input
            type="file"
            accept="image/png"
            disabled={uploading}
            aria-label="Upload guild logo PNG"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = '';
            }}
          />
        </label>
      ) : (
        <div className="size-24 shrink-0 overflow-hidden border border-sand-200/20 bg-obsidian-900">{emblem}</div>
      )}
      <FormMessage error={error} status={status} />
    </div>
  );
}
