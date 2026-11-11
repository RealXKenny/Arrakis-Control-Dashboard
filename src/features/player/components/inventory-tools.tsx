'use client';

import { useEffect, useRef, useState } from 'react';
import { ItemFinder } from './item-finder';
import {
  ITEM_PIN_LIMIT,
  itemPinsRecordSchema,
  type ItemPin,
  type ItemPinReading,
  type ItemPinsRecord,
} from '../item-pins';

async function payload(response: Response): Promise<unknown> {
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'Pinned item request failed.');
  return value;
}
function pinRecord(value: unknown): ItemPinsRecord {
  const parsed = itemPinsRecordSchema.safeParse(value);
  if (!parsed.success) throw new Error('Pinned item settings could not be read.');
  return parsed.data;
}

export function InventoryTools() {
  const [record, setRecord] = useState<ItemPinsRecord | null>(null);
  const [reading, setReading] = useState<ItemPinReading | null>(null);
  const [message, setMessage] = useState('Loading pinned items…');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const settings = useRef<AbortController | null>(null);
  const scan = useRef<AbortController | null>(null);

  async function loadPins() {
    settings.current?.abort();
    const controller = new AbortController();
    settings.current = controller;
    setSaving(true);
    setMessage('Loading pinned items…');
    try {
      const value = pinRecord(
        await payload(
          await fetch('/api/v2/items/pins', {
            cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          }),
        ),
      );
      if (!controller.signal.aborted) {
        setRecord(value);
        setReading(null);
        setMessage('');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setRecord(null);
        setMessage(error instanceof Error ? error.message : 'Pinned items unavailable.');
      }
    } finally {
      if (settings.current === controller) setSaving(false);
    }
  }
  useEffect(() => {
    void loadPins();
    return () => {
      settings.current?.abort();
      scan.current?.abort();
    };
  }, []);

  async function savePins(pins: ItemPin[]) {
    if (!record || saving) {
      setMessage('Wait for pinned items to load, or refresh settings.');
      return;
    }
    settings.current?.abort();
    scan.current?.abort();
    setBusy(false);
    const controller = new AbortController();
    settings.current = controller;
    setSaving(true);
    setMessage('Saving pinned items…');
    try {
      const next = pinRecord(
        await payload(
          await fetch('/api/v2/items/pins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revision: record.revision, pins }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          }),
        ),
      );
      if (!controller.signal.aborted) {
        setRecord(next);
        setReading(null);
        setMessage('Pinned items saved. Refresh counts for current observations.');
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          `${error instanceof Error ? error.message : 'Save was not confirmed.'} Refresh pin settings before another change.`,
        );
    } finally {
      if (settings.current === controller) setSaving(false);
    }
  }
  function pin(item: ItemPin) {
    if (!record) {
      setMessage('Load pinned item settings first.');
      return;
    }
    if (record.pins.some((entry) => entry.templateId.toLowerCase() === item.templateId.toLowerCase())) {
      setMessage('That item is already pinned.');
      return;
    }
    if (record.pins.length >= ITEM_PIN_LIMIT) {
      setMessage(`Remove an item before pinning more than ${ITEM_PIN_LIMIT}.`);
      return;
    }
    void savePins([...record.pins, item]);
  }
  async function refreshCounts() {
    scan.current?.abort();
    const controller = new AbortController();
    scan.current = controller;
    setBusy(true);
    setMessage('Checking current authorized sources…');
    try {
      const next = (await payload(
        await fetch('/api/v2/items/pins/readings', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        }),
      )) as ItemPinReading;
      if (!controller.signal.aborted) {
        if (next.revision !== record?.revision) {
          setMessage('Pinned items changed. Refresh settings before checking counts.');
          setReading(null);
        } else {
          setReading(next);
          setMessage('Counts checked. Review source coverage for incomplete readings.');
        }
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error ? error.message : 'Counts unavailable; previous readings have not been refreshed.',
        );
    } finally {
      if (scan.current === controller) setBusy(false);
    }
  }
  return (
    <>
      <section className="panel mb-6 min-w-0 p-6" aria-labelledby="pins-title">
        <h2 id="pins-title" className="text-base">
          Pinned item counters
        </h2>
        <p className="mt-3 text-sm text-sand-400">
          Pin up to {ITEM_PIN_LIMIT} item templates from finder results. Private to your account and linked character.
          Counts observe current authorized storage; they never reserve or move items.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn btn-ghost" disabled={saving || busy} onClick={() => void loadPins()}>
            Refresh pin settings
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || busy || !record?.pins.length}
            onClick={() => void refreshCounts()}
          >
            Refresh counts
          </button>
          {busy && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                scan.current?.abort();
                setBusy(false);
                setMessage('Count refresh cancelled. Earlier readings retain their original timestamp.');
              }}
            >
              Cancel count refresh
            </button>
          )}
        </div>
        <p role="status" className="mt-4 break-words text-sm text-sand-400">
          {message}
        </p>
        {record && record.pins.length === 0 && (
          <p className="mt-4 text-sm">No pinned items. Find an item below and select Pin counter.</p>
        )}
        <ul className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Pinned item counters">
          {record?.pins.map((item) => {
            const counter = reading?.counters.find((entry) => entry.templateId === item.templateId);
            return (
              <li key={item.templateId} className="min-w-0 break-words border border-sand-200/20 p-4">
                <strong className="text-sm">{item.name}</strong>
                <p className="mt-2 font-mono text-lg text-spice-400">
                  {!counter
                    ? 'Not checked'
                    : counter.complete
                      ? counter.quantity
                      : counter.quantity === '0'
                        ? 'Unknown (0 observed)'
                        : `At least ${counter.quantity}`}
                </p>
                <p className="mt-1 text-xs text-sand-400">
                  {item.templateId}
                  {counter && !counter.complete ? ' · incomplete coverage' : ''}
                </p>
                <button
                  type="button"
                  className="btn btn-ghost mt-3"
                  disabled={saving || busy}
                  aria-label={`Unpin ${item.name}`}
                  onClick={() => void savePins(record.pins.filter((entry) => entry.templateId !== item.templateId))}
                >
                  Unpin
                </button>
              </li>
            );
          })}
        </ul>
        {reading && (
          <details
            className="mt-4 text-xs"
            open={reading.coverage.limited || reading.coverage.sources.some((source) => source.status !== 'ok')}
          >
            <summary className="cursor-pointer">
              Counter source coverage · {new Date(reading.coverage.startedAt).toLocaleString()}
            </summary>
            <ul className="mt-3 grid gap-2" aria-label="Counter source coverage">
              {reading.coverage.sources.map((source, index) => (
                <li className="break-words" key={index}>
                  {source.name}: {source.status} · {new Date(source.checkedAt).toLocaleTimeString()}
                  <p className="text-sand-400">{source.detail}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <ItemFinder onPin={pin} />
    </>
  );
}
