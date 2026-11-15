'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { navigationFor, navigationItemFor } from '../../../components/navigation/nav-config';
import { NavigationLink } from '../../../components/navigation/navigation-link';
import { assetLookupSchema, navigationCommands, type AssetLookup } from '../model';
import styles from './command-palette.module.css';

export function CommandPalette({
  isAdmin,
  onClose,
  returnFocus,
}: {
  isAdmin: boolean;
  onClose(): void;
  returnFocus: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const initialPath = useRef(usePathname());
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'navigation' | 'assets'>('navigation');
  const [reading, setReading] = useState<AssetLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const destinations = navigationCommands(navigationFor({ isAdmin }), query);
  const storage = navigationItemFor('storage')?.href;
  const results =
    mode === 'navigation'
      ? destinations.map((d) => ({ ...d, key: d.id }))
      : [
          ...(reading?.assets.map((a) => ({
            key: `${a.kind}-${a.id}`,
            label: a.name,
            detail: `${a.kind} · ${a.access} · #${a.id}`,
            href: a.href,
          })) ?? []),
          ...(query.trim() && storage
            ? [
                {
                  key: 'item-finder',
                  label: `Find items: ${query.trim()}`,
                  detail: 'Opens the existing finder; search starts only when you confirm there.',
                  href: `${storage}?find=${encodeURIComponent(query.trim())}#finder-title`,
                },
              ]
            : []),
        ];
  const invalidate = () => {
    request.current?.abort();
    request.current = null;
    setReading(null);
    setBusy(false);
    setError('');
    setActive(0);
  };
  useEffect(() => {
    const element = dialog.current;
    const opener = returnFocus;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    input.current?.focus();
    const hide = () => {
      if (document.visibilityState !== 'visible') onClose();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      request.current?.abort();
      element?.close();
      document.removeEventListener('visibilitychange', hide);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose, returnFocus]);
  useEffect(() => {
    if (pathname !== initialPath.current) onClose();
  }, [pathname, onClose]);
  async function lookup() {
    if (request.current || !query.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setReading(null);
    setError('');
    setActive(0);
    const timer = setTimeout(() => controller.abort('timeout'), 16000);
    let failureMessage = 'Asset lookup could not be confirmed. Try again explicitly.';
    try {
      const response = await fetch(`/api/v2/commands/assets?q=${encodeURIComponent(query.trim())}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const raw: unknown = await response.json();
      if (!response.ok) {
        failureMessage =
          response.status === 401
            ? 'Your session ended. Sign in again.'
            : response.status === 403
              ? 'Link a verified character before looking up assets.'
              : response.status === 429
                ? 'Search capacity reached. Try again later.'
                : failureMessage;
        throw new Error('Lookup failed');
      }
      const parsed = assetLookupSchema.safeParse(raw);
      if (!parsed.success) throw new Error('Invalid lookup response');
      if (!controller.signal.aborted && request.current === controller) setReading(parsed.data);
    } catch {
      if (request.current === controller)
        setError(
          controller.signal.aborted ? 'Asset lookup cancelled or timed out. No results retained.' : failureMessage,
        );
    } finally {
      clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="command-title"
      aria-describedby="command-help"
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]') ?? [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
        }
      }}
    >
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Arrakis Control</p>
          <h2 id="command-title">Command palette</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close command palette">
          Esc ×
        </button>
      </div>
      <p id="command-help">
        Ctrl/Command + K opens commands outside editors. Use ↑/↓ to select, Enter to open and Escape to close. No game
        actions run here.
      </p>
      <div role="group" aria-label="Command mode" className={styles.modes}>
        {(['navigation', 'assets'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              invalidate();
              setMode(value);
              input.current?.focus();
            }}
          >
            {value === 'navigation' ? 'Navigation' : 'Asset lookup'}
          </button>
        ))}
      </div>
      <form
        className={styles.search}
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'assets') void lookup();
        }}
      >
        <label htmlFor="command-query">
          {mode === 'navigation' ? 'Search dashboard destinations' : 'Search your bases, vehicles or items'}
        </label>
        <input
          ref={input}
          id="command-query"
          type="search"
          autoComplete="off"
          maxLength={80}
          value={query}
          aria-controls="command-results"
          onChange={(e) => {
            invalidate();
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (['ArrowDown', 'ArrowUp'].includes(e.key) && results.length) {
              e.preventDefault();
              const next = e.key === 'ArrowDown' ? 0 : results.length - 1;
              dialog.current?.querySelector<HTMLAnchorElement>(`[data-command-index="${next}"]`)?.focus();
            } else if (e.key === 'Enter' && mode === 'navigation' && results.length) {
              e.preventDefault();
              dialog.current
                ?.querySelector<HTMLAnchorElement>(`[data-command-index="${Math.min(active, results.length - 1)}"]`)
                ?.click();
            }
          }}
        />
        {mode === 'assets' && (
          <button type="submit" disabled={busy || !query.trim()}>
            Search bases and vehicles
          </button>
        )}
        {busy && (
          <button
            type="button"
            onClick={() => {
              invalidate();
              setError('Asset lookup cancelled. No results retained.');
            }}
          >
            Cancel lookup
          </button>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
      <p role="status">
        {busy
          ? 'Checking current asset access…'
          : mode === 'navigation'
            ? `${results.length} destinations.`
            : reading
              ? `${reading.assets.length} authorized assets. ${reading.partial ? 'Partial coverage: some assets or sources were unavailable or excluded.' : 'Checked the bounded player-scoped lists.'} Checked ${reading.checkedAt}.`
              : 'Type a query and explicitly search. Asset results are never kept after closing.'}
      </p>
      <ul
        id="command-results"
        className={styles.results}
        aria-label="Command results"
        onKeyDown={(e) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !results.length) return;
          e.preventDefault();
          const next =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? results.length - 1
                : (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
          dialog.current?.querySelector<HTMLAnchorElement>(`[data-command-index="${next}"]`)?.focus();
        }}
      >
        {results.map((item, index) => (
          <li key={item.key}>
            <NavigationLink
              href={item.href}
              prefetch={false}
              data-command-index={index}
              data-selected={active === index || undefined}
              onFocus={() => setActive(index)}
              onClick={onClose}
            >
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </NavigationLink>
          </li>
        ))}
      </ul>
      {!results.length && !busy && (
        <p>No matching {mode === 'navigation' ? 'destinations' : 'results yet'}. Try another query.</p>
      )}
    </dialog>
  );
}
