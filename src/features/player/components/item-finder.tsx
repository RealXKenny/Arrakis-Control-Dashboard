'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ItemPin } from '../item-pins';
import type { FinderResult } from '../item-finder';
import { taskDraftHref } from '../../tasks/model';
import { DataFreshness } from '../../monitoring/components/data-freshness';
import { beginCheck, emptyHealth, failedRead, sourceReadTime, successfulRead } from '../../monitoring/freshness';

export function ItemFinder({
  onPin,
  initialQuery = '',
}: { onPin?: (pin: ItemPin) => void; initialQuery?: string } = {}) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<FinderResult | null>(null);
  const [health, setHealth] = useState(emptyHealth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        active.current?.abort();
        setResult(null);
        setLoading(false);
        setHealth((previous) => ({ ...previous, phase: 'paused' }));
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      active.current?.abort();
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  async function search() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError('');
    setResult(null);
    setHealth((previous) => beginCheck(previous));
    let accessDenied = false;
    try {
      const response = await fetch(`/api/v2/items/find?q=${encodeURIComponent(query.trim())}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        accessDenied = [401, 403, 409].includes(response.status);
        throw new Error(data.error || 'Search failed. Try again.');
      }
      if (!controller.signal.aborted) {
        if (!Array.isArray(data.items) || !Array.isArray(data.sources))
          throw new Error('Search response could not be confirmed.');
        const observedAt = sourceReadTime(data.sources);
        const partial = data.limited || data.sources.some((source: { status: string }) => source.status !== 'ok');
        setHealth((previous) => successfulRead(previous, observedAt, partial));
        setResult(data as FinderResult);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setHealth((previous) => failedRead(previous, accessDenied));
        setError(failure instanceof Error ? failure.message : 'Search failed.');
      }
    } finally {
      if (active.current === controller) setLoading(false);
    }
  }

  return (
    <section className="panel mb-6 min-w-0 p-6" aria-labelledby="finder-title">
      <h2 id="finder-title" className="text-base">
        Universal item finder
      </h2>
      <p className="mt-3 text-sm text-sand-400">
        Search your character, authorized base containers and vehicle cargo. No game guild is required. Read-only;
        permission checks and readings are refreshed for every search.
      </p>
      <form
        className="mt-4 flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          type="search"
          aria-label="Find across your assets"
          value={query}
          onChange={(event) => {
            active.current?.abort();
            setResult(null);
            setLoading(false);
            setHealth(emptyHealth());
            setQuery(event.target.value);
          }}
          required
          maxLength={128}
          placeholder="Item name or template"
          className="h-11 min-w-0 flex-1 basis-40 border border-sand-200/20 bg-obsidian-900 px-3 text-sm"
        />
        <button className="btn btn-primary" disabled={loading || !query.trim()} type="submit">
          Find items
        </button>
        {loading && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              active.current?.abort();
              setLoading(false);
              setError('Search cancelled. No results retained.');
              setHealth((previous) => ({ ...previous, phase: 'paused' }));
            }}
          >
            Cancel search
          </button>
        )}
      </form>
      <div role="status" className="mt-4 text-sm text-sand-400">
        {loading
          ? 'Checking authorized sources…'
          : error ||
            (result
              ? `${result.items.length} matching stacks${result.limited || result.sources.some((source) => source.status !== 'ok') ? ' · partial results' : ''}`
              : '')}
      </div>
      <DataFreshness label="Item search freshness" health={health} />
      {result && (
        <>
          <p className="mt-2 text-xs text-sand-400">
            Started {new Date(result.startedAt).toLocaleString()}. These are observations, not live totals. Slot numbers
            use the Console’s zero-based index.
          </p>
          {result.items.length === 0 && (
            <p className="mt-4 text-sm">No matches in successfully checked sources. Review source coverage below.</p>
          )}
          <ul className="mt-4 grid min-w-0 gap-3 md:grid-cols-2" aria-label="Item finder results">
            {result.items.map((item) => (
              <li key={item.id} className="min-w-0 break-words border border-sand-200/20 p-4">
                <strong className="text-sm">{item.name}</strong>
                <p className="mt-2 text-sm">
                  Quantity {item.quantity} · Grade {item.grade}
                </p>
                <p className="mt-1 text-xs text-sand-400">Durability {item.durability}</p>
                {item.augments.length > 0 && <p className="mt-1 text-xs">Augments: {item.augments.join(', ')}</p>}
                <p className="mt-3 text-xs text-sand-300">{item.location}</p>
                {onPin && item.templateId && (
                  <button
                    type="button"
                    className="btn btn-ghost mt-3"
                    aria-label={`Pin ${item.name}`}
                    onClick={() => onPin({ templateId: item.templateId, name: item.name })}
                  >
                    Pin counter
                  </button>
                )}
                <Link className="mt-3 inline-block text-sm text-spice-400 underline" href={item.href}>
                  Open source workspace
                </Link>
                {taskDraftHref({ type: 'item', ref: item.templateId || item.name, label: item.name.slice(0, 160) }) && (
                  <Link
                    className="mt-3 block min-h-11 text-sm text-spice-300 underline"
                    href={taskDraftHref({
                      type: 'item',
                      ref: item.templateId || item.name,
                      label: item.name.slice(0, 160),
                    })!}
                  >
                    Plan a task for {item.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <details
            className="mt-5 border-t border-sand-200/20 pt-4"
            open={result.sources.some((source) => source.status !== 'ok')}
          >
            <summary className="cursor-pointer text-sm">Source coverage and freshness</summary>
            <ul className="mt-3 grid gap-3 text-xs" aria-label="Item finder sources">
              {result.sources.map((source, index) => (
                <li className="break-words" key={index}>
                  <strong>
                    {source.name}: {source.status}
                  </strong>{' '}
                  · {new Date(source.checkedAt).toLocaleTimeString()}
                  <p className="mt-1 text-sand-400">{source.detail}</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
