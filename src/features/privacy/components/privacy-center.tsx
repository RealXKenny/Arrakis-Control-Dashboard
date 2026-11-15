'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  emptyPrivacy,
  privacyCategories,
  privacyNames,
  privacyCard,
  privacyCardSchema,
  privacyEnvelopeSchema,
  readyToPublish,
  type PrivacyCategory,
  type PrivacyCard,
  type PrivacyInput,
  type PrivacyRecord,
} from '../model';
import { CardContent } from './card-content';
import { CardEditor } from './card-editor';
import styles from './privacy.module.css';
export function PrivacyCenter() {
  const [record, setRecord] = useState<PrivacyRecord | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [drafts, setDrafts] = useState(() => emptyPrivacy().drafts);
  const [editing, setEditing] = useState<PrivacyCategory | null>(null);
  const [hours, setHours] = useState<1 | 24 | 168>(24);
  const [preview, setPreview] = useState<{ card: PrivacyCard; hours: 1 | 24 | 168; revision: string | null } | null>(
    null,
  );
  const [rotating, setRotating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const previewHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);
  async function send(input?: PrivacyInput) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    const timeout = setTimeout(() => controller.abort('timeout'), 10000);
    try {
      const response = await fetch('/api/v2/privacy', {
        method: input ? 'POST' : 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: input ? { 'Content-Type': 'application/json' } : undefined,
        body: input ? JSON.stringify(input) : undefined,
      });
      const raw: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Your session ended. Sign in again.'
            : response.status === 409
              ? 'Privacy settings changed in another tab. Reload before trying again. Your draft is kept.'
              : 'Privacy status could not be confirmed. Reload before trying again. Your last saved sharing may still be visible.',
        );
      const parsed = privacyEnvelopeSchema.safeParse(raw);
      if (!parsed.success || (input && !parsed.data.record.revision))
        throw new Error('Privacy status could not be confirmed. Reload before trying again.');
      if (controller.signal.aborted) return;
      setRecord(parsed.data.record);
      setCheckedAt(Date.parse(parsed.data.checkedAt));
      setEditing(null);
      setPreview(null);
      setRotating(false);
      setMessage(
        !input
          ? 'Saved privacy settings loaded.'
          : input.action === 'save-draft'
            ? 'Private draft saved. Any published version is unchanged.'
            : input.action === 'publish'
              ? 'Reviewed card published to your member link.'
              : input.action === 'revoke-all'
                ? 'All cards unpublished and the old member link revoked.'
                : input.action === 'rotate-link'
                  ? 'Member link replaced. Previous links no longer work.'
                  : 'Card unpublished. Its saved draft stays private.',
      );
    } catch (failure) {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout')
        setError(
          controller.signal.reason === 'timeout'
            ? 'Privacy change timed out. Reload before trying again; your last saved sharing may still be visible.'
            : failure instanceof Error
              ? failure.message
              : 'Privacy status is unknown. Reload settings.',
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setBusy(false);
    }
  }
  useEffect(() => {
    void send();
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, []);
  function review() {
    if (!record || !editing) return;
    const parsed = privacyCardSchema.safeParse(privacyCard(editing, drafts));
    if (!parsed.success || !readyToPublish(parsed.data)) {
      setError('Complete the card before publishing. Use unique specialties/items and whole-number supply quantities.');
      return;
    }
    setError('');
    setPreview({ card: parsed.data, hours, revision: record.revision });
  }
  const active = record
    ? privacyCategories.filter(
        (category) => record.publications[category] && Date.parse(record.publications[category]!.expiresAt) > checkedAt,
      )
    : [];
  return (
    <section className={styles.root} aria-label="Privacy center">
      <p className={styles.note}>
        Nothing is shared by default. These cards contain only details you type and review. They never fetch your game
        position, inventory, crafting unlocks, account email or linked-character data.
      </p>
      <div className={styles.actions}>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void send()}>
          Reload saved privacy settings
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !record}
          onClick={() => void send({ action: 'revoke-all', revision: record!.revision })}
        >
          Revoke all sharing
        </button>
      </div>
      <p className={styles.note}>
        Revoking all unpublishes every card and replaces the link, preserving saved private drafts. Reloading discards
        unsaved edits. These actions stop future fresh reads; they cannot retract copies already seen or saved.
      </p>
      <p role="status" className={styles.note}>
        {busy ? 'Loading or saving privacy settings…' : message}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!record && !busy && (
        <p className={styles.note}>Your current sharing status is unknown until settings can be loaded.</p>
      )}
      {record && (
        <>
          <p className={styles.note}>
            {active.length} active shared cards as of the last check. Private drafts expire after 90 days without
            opening or updating this center. Member views do not extend that retention.
          </p>
          {record.shareId && active.length > 0 && (
            <div className={styles.linkPanel}>
              <h2>Your member link</h2>
              <p>
                Only signed-in Arrakis Control members who have this unlisted link can open it. It is not a public
                internet page.
              </p>
              <label>
                Member sharing link
                <input readOnly value={`/sharing/${record.shareId}`} />
              </label>
              <div className={styles.actions}>
                <Link href={`/sharing/${record.shareId}`} prefetch={false} className={styles.link}>
                  Open member view
                </Link>
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        new URL(`/sharing/${record.shareId}`, window.location.origin).href,
                      );
                      setMessage('Member link copied.');
                    } catch {
                      setError('Copy is unavailable. Select the member sharing link to copy it.');
                    }
                  }}
                >
                  Copy member link
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={busy || Boolean(editing)}
                  onClick={() => setRotating(true)}
                >
                  Replace member link
                </button>
              </div>
              {rotating && (
                <div role="group" aria-label="Confirm member link replacement">
                  <p>Old links will stop working. Current publications and their expiry times stay the same.</p>
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void send({ action: 'rotate-link', revision: record.revision })}
                  >
                    Confirm replace link
                  </button>
                  <button className="btn btn-secondary" disabled={busy} onClick={() => setRotating(false)}>
                    Keep current link
                  </button>
                </div>
              )}
            </div>
          )}
          <div className={styles.grid}>
            {privacyCategories.map((category) => {
              const publication = record.publications[category];
              const shared = publication && Date.parse(publication.expiresAt) > checkedAt;
              return (
                <article className={styles.card} key={category} aria-label={`${privacyNames[category]} privacy`}>
                  <p className={styles.eyebrow}>
                    {shared ? 'Shared with members by link' : publication ? 'Publication expired' : 'Private'}
                  </p>
                  <h2>{privacyNames[category]}</h2>
                  <p>
                    {shared
                      ? `Expires ${publication.expiresAt}. Only the published snapshot below is shared.`
                      : 'No active publication for this card.'}
                  </p>
                  {shared && <CardContent card={{ category, data: publication.data } as PrivacyCard} />}
                  <div className={styles.actions}>
                    <button
                      className="btn btn-secondary"
                      disabled={busy || Boolean(editing)}
                      onClick={() => {
                        setDrafts(structuredClone(record.drafts));
                        setEditing(category);
                        setPreview(null);
                        setHours(category === 'location' || category === 'supply' ? 24 : 168);
                        setError('');
                      }}
                    >
                      {shared ? 'Edit saved draft' : 'Create or edit private draft'}
                    </button>
                    {publication && (
                      <button
                        className="btn btn-secondary"
                        disabled={busy || Boolean(editing)}
                        onClick={() => void send({ action: 'unpublish', revision: record.revision, category })}
                      >
                        Unpublish {privacyNames[category].toLowerCase()}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {editing && (
            <section className={styles.editor} aria-label={`${privacyNames[editing]} sharing editor`}>
              {preview ? (
                <>
                  <h2 ref={previewHeading} tabIndex={-1}>
                    Review {privacyNames[preview.card.category].toLowerCase()} publication
                  </h2>
                  <p className={styles.note}>
                    The exact card content below will be available to signed-in dashboard members with your link for{' '}
                    {preview.hours} hour{preview.hours === 1 ? '' : 's'}. Expiry starts when the server confirms
                    publication. Someone who reads it may save a copy.
                  </p>
                  <div className={styles.preview}>
                    <CardContent card={preview.card} />
                  </div>
                  <div className={styles.actions}>
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() =>
                        void send({
                          action: 'publish',
                          revision: preview.revision,
                          card: preview.card,
                          hours: preview.hours,
                          confirmed: true,
                        })
                      }
                    >
                      Publish reviewed {privacyNames[preview.card.category].toLowerCase()}
                    </button>
                    <button className="btn btn-secondary" disabled={busy} onClick={() => setPreview(null)}>
                      Back to private draft
                    </button>
                  </div>
                </>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    review();
                  }}
                >
                  <fieldset className={styles.fields} disabled={busy}>
                    <legend>{privacyNames[editing]} private draft</legend>
                    <CardEditor category={editing} drafts={drafts} setDrafts={setDrafts} />
                    <div className={styles.fields}>
                      <label htmlFor="privacy-expiry">Publication duration</label>
                      <select
                        id="privacy-expiry"
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value) as typeof hours)}
                      >
                        <option value={1}>1 hour</option>
                        <option value={24}>24 hours</option>
                        {editing !== 'location' && <option value={168}>7 days</option>}
                      </select>
                    </div>
                    <p className={styles.note}>
                      Saving a private draft does not publish it or replace an already-published snapshot. Use Unpublish
                      to stop sharing. Review and confirm to publish a new version.
                    </p>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          const parsed = privacyCardSchema.safeParse(privacyCard(editing, drafts));
                          if (!parsed.success) {
                            setError('Check card fields, unique item/specialty names and bounded quantities.');
                            return;
                          }
                          void send({ action: 'save-draft', revision: record.revision, card: parsed.data });
                        }}
                      >
                        Save private draft
                      </button>
                      <button className="btn btn-primary" type="submit">
                        Review publication
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                        Cancel editing
                      </button>
                    </div>
                  </fieldset>
                </form>
              )}
            </section>
          )}
        </>
      )}
      <section className={styles.card} aria-label="Other sharing surfaces">
        <h2>Other sharing surfaces</h2>
        <p>
          These controls manage the four voluntary cards above. They do not hide game rosters, chat messages, guild
          coordination records, blueprints you published elsewhere, or information other members already received.
        </p>
        <div className={styles.actions}>
          <Link className={styles.link} href="/bases">
            Base marketplace controls
          </Link>
          <Link className={styles.link} href="/guild">
            Guild workspace controls
          </Link>
          <Link className={styles.link} href="/chat">
            Live chat
          </Link>
        </div>
      </section>
    </section>
  );
}
