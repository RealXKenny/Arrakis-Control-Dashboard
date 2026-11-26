'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { CheckField, Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { MAP_LABELS, MAP_NAMES, type MapName } from '../../map/maps';
import { readJson } from '../hooks/use-expedition-data';
import type { Bookmark } from '../model';
import {
  RESCUE_ASSISTANCE,
  RESCUE_ASSISTANCE_LABELS,
  RESCUE_HOURS,
  type RescueData,
  type RescueOwnerView,
} from '../rescue';
import { RescueCardView } from './rescue-card';

const muted = 'text-sm text-sand-400';
type Assistance = (typeof RESCUE_ASSISTANCE)[number];

/** N040 owner panel: nothing is shared until the requester reviews the card and confirms publication. */
export function RescuePanel({ bookmarks }: { bookmarks: Bookmark[] }) {
  const [view, setView] = useState<RescueOwnerView | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);
  const [review, setReview] = useState<{ data: RescueData; hours: 1 | 2 | 6 } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [callSign, setCallSign] = useState('');
  const [map, setMap] = useState<MapName>('DeepDesert');
  const [bookmarkId, setBookmarkId] = useState('');
  const [place, setPlace] = useState('');
  const [assistance, setAssistance] = useState<Assistance[]>([]);
  const [details, setDetails] = useState('');
  const [hours, setHours] = useState<1 | 2 | 6>(2);
  const active = useRef<AbortController | null>(null);

  async function request(init?: RequestInit, done = '') {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      const value = (await readJson(
        await fetch('/api/v2/expeditions/rescue', {
          cache: 'no-store',
          ...init,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        }),
        'Rescue requests are unavailable.',
      )) as RescueOwnerView;
      if (!controller.signal.aborted) {
        setView(value);
        setStatus(done);
      }
      return true;
    } catch (caught) {
      if (!controller.signal.aborted) {
        setStatus('');
        setError(
          `${caught instanceof Error ? caught.message : 'Rescue request failed.'}${init ? ' Reload to confirm what is currently shared.' : ''}`,
        );
      }
      return false;
    } finally {
      if (active.current === controller) setBusy(false);
    }
  }

  useEffect(() => {
    void request();
    return () => active.current?.abort();
  }, []);

  function prepare(event: FormEvent) {
    event.preventDefault();
    const bookmark = bookmarks.find((entry) => entry.id === bookmarkId) ?? null;
    if (assistance.length === 0) {
      setError('Choose at least one kind of assistance.');
      return;
    }
    setError('');
    setConfirmed(false);
    setReview({
      hours,
      data: {
        callSign: callSign.trim(),
        map: bookmark?.map ?? map,
        x: bookmark?.x ?? null,
        y: bookmark?.y ?? null,
        place: place.trim() || bookmark?.label || '',
        assistance,
        details: details.trim(),
      },
    });
  }

  async function publish() {
    if (!review || !confirmed) return;
    const ok = await request(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish',
          data: review.data,
          hours: review.hours,
          confirmed: true,
          expected: view?.active?.tag ?? null,
        }),
      },
      'Rescue request published. Share the link with the people you want to help.',
    );
    if (ok) setReview(null);
  }

  const link =
    view?.active && typeof window !== 'undefined'
      ? `${window.location.origin}/expeditions/rescue/${view.active.shareId}`
      : null;

  return (
    <Card as="section" aria-labelledby="rescue" className="ui-card grid gap-4 p-5">
      <h2 id="rescue" className="text-base font-semibold text-sand-50">
        Rescue request card
      </h2>
      <p className={muted}>
        Opt-in and off by default. The card contains only what you enter or choose here, never a live position. It is
        visible to signed-in dashboard members who have its unlisted link, and expires automatically. Ending it stops
        future reads but cannot recall what someone already saw.
      </p>
      <FormMessage error={error} status={status} />
      {view?.active && link && (
        <div className="grid gap-3">
          <RescueCardView card={view.active} />
          <Field label="Member link">
            <input className={inputClass} readOnly value={link} onFocus={(e) => e.target.select()} />
          </Field>
          <div>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void request(
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'cancel', expected: view.active?.tag }),
                  },
                  'Rescue request ended. The link no longer works.',
                )
              }
            >
              End rescue request
            </Button>
          </div>
        </div>
      )}
      {review ? (
        <div className="grid gap-3">
          <p className="text-sm text-sand-100">
            Review exactly what will be shared for {review.hours} hour{review.hours === 1 ? '' : 's'}
            {view?.active ? '. Publishing replaces your current card and its link.' : '.'}
          </p>
          <RescueCardView
            card={{
              data: review.data,
              publishedAt: '',
              expiresAt: '',
            }}
          />
          <CheckField
            label="I want to share this location and request with members who have the link."
            checked={confirmed}
            onChange={setConfirmed}
          />
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy || !confirmed} onClick={() => void publish()}>
              Publish rescue request
            </Button>
            <Button onClick={() => setReview(null)}>Back to editing</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={prepare} className="grid gap-3 sm:grid-cols-2">
          <Field label="Call sign" hint="How helpers should find you, such as your character name.">
            <input
              className={inputClass}
              required
              maxLength={40}
              value={callSign}
              onChange={(e) => setCallSign(e.target.value)}
            />
          </Field>
          <Field label="Use a saved bookmark (optional)">
            <select className={inputClass} value={bookmarkId} onChange={(e) => setBookmarkId(e.target.value)}>
              <option value="">No bookmark: describe the place</option>
              {bookmarks.map((bookmark) => (
                <option key={bookmark.id} value={bookmark.id}>
                  {bookmark.label} ({MAP_LABELS[bookmark.map]})
                </option>
              ))}
            </select>
          </Field>
          {!bookmarkId && (
            <Field label="Map">
              <select className={inputClass} value={map} onChange={(e) => setMap(e.target.value as MapName)}>
                {MAP_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {MAP_LABELS[name]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Place description">
            <input
              className={inputClass}
              required={!bookmarkId}
              maxLength={120}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
          </Field>
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="mb-1 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
              Assistance needed
            </legend>
            <div className="flex flex-wrap gap-4">
              {RESCUE_ASSISTANCE.map((kind) => (
                <CheckField
                  key={kind}
                  label={RESCUE_ASSISTANCE_LABELS[kind]}
                  checked={assistance.includes(kind)}
                  onChange={(checked) =>
                    setAssistance((current) =>
                      checked ? [...current, kind] : current.filter((entry) => entry !== kind),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <Field label="Details">
              <textarea
                className={inputClass}
                rows={2}
                maxLength={500}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Share for">
            <select
              className={inputClass}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value) as 1 | 2 | 6)}
            >
              {RESCUE_HOURS.map((value) => (
                <option key={value} value={value}>
                  {value} hour{value === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              Review card
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
