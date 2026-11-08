'use client';

import { useMemo, useState } from 'react';
import {
  announcementInputSchema,
  buildWebhookPayload,
  parseProgressLines,
  type ReleaseNotes,
} from '../../../changelog/discord';
import { EmbedPreview } from './embed-preview';

const FIELD =
  'w-full border border-sand-200/20 bg-obsidian-900 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-sand-50 placeholder:text-sand-600';
const LABEL = 'grid gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-sand-400';

interface ButtonDraft {
  label: string;
  url: string;
}

export function Composer({
  releases,
  appUrl,
  canSend,
}: {
  releases: ReleaseNotes[];
  appUrl: string | undefined;
  canSend: boolean;
}) {
  const [kind, setKind] = useState<'release' | 'progress'>('release');
  const [version, setVersion] = useState(releases[0]?.version ?? '');
  const [headline, setHeadline] = useState('');
  const [note, setNote] = useState('');
  const [progressText, setProgressText] = useState(
    '[x] Landing page\n[x] Market grid\n[~] Base marketplace\n[ ] Discord announcements',
  );
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const draft = useMemo(
    () => ({
      kind,
      version,
      headline,
      note,
      progress: parseProgressLines(progressText),
      buttons: buttons.filter((button) => button.label.trim() || button.url.trim()),
    }),
    [kind, version, headline, note, progressText, buttons],
  );

  // The same pure builder the server uses, so the preview is what Discord receives.
  const preview = useMemo(() => {
    const parsed = announcementInputSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { error: `${issue.path.join('.') || 'Form'}: ${issue.message}` as string, payload: null };
    }
    try {
      const release = releases.find((entry) => entry.version === parsed.data.version);
      return { error: null, payload: buildWebhookPayload(parsed.data, { appUrl, release, now: new Date(0) }) };
    } catch (reason) {
      return { error: reason instanceof Error ? reason.message : 'Cannot build this announcement.', payload: null };
    }
  }, [draft, releases, appUrl]);

  async function send() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/v2/changelog/announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = (await response.json().catch(() => null)) as { edited?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? 'The announcement failed.');
      setMessage({ tone: 'ok', text: body?.edited ? 'Updated the existing progress post.' : 'Announcement posted.' });
    } catch (reason) {
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'The announcement failed.' });
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  const updateButton = (index: number, patch: Partial<ButtonDraft>) =>
    setButtons((current) => current.map((button, i) => (i === index ? { ...button, ...patch } : button)));

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form className="panel grid content-start gap-5 p-6" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="grid gap-2">
          <legend className={LABEL}>Type</legend>
          <div className="grid grid-cols-2 border border-sand-200/20">
            {(['release', 'progress'] as const).map((option) => (
              <label
                key={option}
                className={`flex min-h-11 cursor-pointer items-center justify-center text-xs font-bold uppercase tracking-[0.2em] ${
                  kind === option ? 'bg-spice-500 text-obsidian-950' : 'text-sand-300 hover:text-spice-300'
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="sr-only"
                />
                {option === 'release' ? 'Release notes' : 'Progress update'}
              </label>
            ))}
          </div>
        </fieldset>

        <label className={LABEL}>
          Version
          <input
            list="release-versions"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            className={FIELD}
            maxLength={40}
          />
          <datalist id="release-versions">
            {releases.slice(0, 20).map((release) => (
              <option key={release.version} value={release.version} />
            ))}
          </datalist>
        </label>

        <label className={LABEL}>
          Headline (optional)
          <input
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            className={FIELD}
            maxLength={200}
          />
        </label>

        {kind === 'progress' && (
          <label className={LABEL}>
            Checklist, one item per line
            <textarea
              value={progressText}
              onChange={(event) => setProgressText(event.target.value)}
              rows={6}
              className={`${FIELD} font-mono`}
            />
            <span className="text-[0.6875rem] normal-case tracking-normal text-sand-500">
              [x] done, [~] in progress, [ ] to do. Sending again for the same version edits the original post.
            </span>
          </label>
        )}

        <label className={LABEL}>
          Note (optional)
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className={FIELD}
            maxLength={1000}
          />
        </label>

        <div className="grid gap-3">
          <p className={LABEL}>Extra link buttons (up to 3)</p>
          {buttons.map((button, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input
                aria-label={`Button ${index + 1} label`}
                placeholder="Label"
                value={button.label}
                maxLength={80}
                onChange={(event) => updateButton(index, { label: event.target.value })}
                className={FIELD}
              />
              <input
                aria-label={`Button ${index + 1} link`}
                placeholder="https://"
                value={button.url}
                maxLength={512}
                onChange={(event) => updateButton(index, { url: event.target.value })}
                className={FIELD}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setButtons((c) => c.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          {buttons.length < 3 && (
            <button
              type="button"
              className="btn btn-ghost justify-self-start"
              onClick={() => setButtons((c) => [...c, { label: '', url: '' }])}
            >
              Add button
            </button>
          )}
        </div>
      </form>

      <div className="grid content-start gap-5">
        <h2 className="eyebrow">Preview</h2>
        {preview.payload ? (
          <EmbedPreview payload={preview.payload} />
        ) : (
          <p role="status" className="border-l-4 border-status-warn bg-status-warn/10 p-4 text-sm text-sand-100">
            {preview.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {armed ? (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={send}>
                {busy ? 'Sending…' : 'Confirm and send'}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setArmed(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canSend || !preview.payload}
              onClick={() => setArmed(true)}
            >
              Send to Discord
            </button>
          )}
          {!canSend && <p className="text-xs text-status-warn">Set CHANGELOG_WEBHOOK_URL to enable sending.</p>}
        </div>

        {message && (
          <p
            role="status"
            className={`border-l-4 p-3 text-sm text-sand-100 ${
              message.tone === 'ok' ? 'border-status-ok bg-status-ok/10' : 'border-status-danger bg-status-danger/10'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
