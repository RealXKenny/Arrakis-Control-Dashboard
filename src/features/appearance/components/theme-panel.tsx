'use client';
import { Button } from '../../../components/ui/button';

import { useEffect, useRef, useState } from 'react';
import { containTabFocus, restoreFocus } from '../../../lib/ui/focus';
import { lockPageScroll } from '../../../lib/ui/scroll-lock';
import { downloadBlob } from '../../../lib/ui/download';
import { appearancePalettes } from '../catalog';
import { applyAppearance, colorsForPreference, deriveAppearance } from '../engine';
import { readAppearance, restoreAppearance, saveAppearance } from '../storage';
import {
  colorLabels,
  colorNames,
  colorsSchema,
  defaultColors,
  defaultPreference,
  type AppearanceColors,
} from '../model';
import styles from './theme-panel.module.css';
export function ThemePanel({ onClose, opener }: { onClose: () => void; opener: HTMLElement | null }) {
  const [saved, setSaved] = useState(readAppearance);
  const [custom, setCustom] = useState<AppearanceColors>(() => ({ ...readAppearance().custom }));
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [tab, setTab] = useState<'palettes' | 'custom'>('palettes');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const committed = useRef(saved);
  const parsed = colorsSchema.safeParse(custom);
  const effective = parsed.success ? deriveAppearance(parsed.data) : null;
  useEffect(() => {
    const modal = dialog.current;
    const unlockScroll = lockPageScroll(document.body);
    modal?.showModal();
    search.current?.focus();
    const sync = (event: StorageEvent) => {
      if (event.key && event.key !== 'arrakis-appearance-v1') return;
      const next = restoreAppearance();
      committed.current = next;
      setSaved(next);
      setPreview(false);
      setMessage('Appearance updated from another tab. Your color draft is kept.');
    };
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('storage', sync);
      applyAppearance(committed.current);
      modal?.close();
      unlockScroll();
      restoreFocus(opener);
    };
  }, [opener]);
  function choose(id: string) {
    const next = { ...saved, selected: id, custom: parsed.success ? parsed.data : saved.custom };
    const retained = saveAppearance(next);
    committed.current = next;
    setSaved(next);
    setPreview(false);
    setMessage(
      retained
        ? `${id === 'custom' ? 'Custom colors' : (appearancePalettes.find((p) => p.id === id)?.name ?? 'Default')} applied and saved for this browser.`
        : 'Appearance applied for this page. Browser storage is unavailable; reload persistence could not be saved.',
    );
    setError('');
  }
  function reset() {
    const next = defaultPreference();
    const retained = saveAppearance(next);
    committed.current = next;
    setSaved(next);
    setCustom({ ...defaultColors });
    setPreview(false);
    setMessage(
      retained
        ? 'Default restored. Saved theme and custom overrides cleared.'
        : 'Default restored for this page. Browser storage could not be cleared.',
    );
  }
  const selected = appearancePalettes.find((p) => p.id === saved.selected);
  const choices = appearancePalettes.filter(
    (p) =>
      (group === 'all' || p.group === group) &&
      `${p.name} ${p.description} ${p.group}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const groups = [...new Set(appearancePalettes.map((p) => p.group))];
  function keydown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
      (event.target as Element).closest('[data-palette-option]')
    ) {
      const options = [...dialog.current!.querySelectorAll<HTMLButtonElement>('[data-palette-option]')];
      const at = options.indexOf(event.target as HTMLButtonElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : (at + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      event.preventDefault();
      options[next]?.focus();
    }
    containTabFocus(event, dialog.current);
  }
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="appearance-title"
      onKeyDown={keydown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
            onClose();
        }
      }}
    >
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Your own Arrakis</p>
          <h2 id="appearance-title">Appearance studio</h2>
          <p>Browser-local themes and full color controls. Other devices and server settings stay independent.</p>
        </div>
        <Button type="button" className={styles.close} aria-label="Close appearance studio" onClick={onClose}>
          ×
        </Button>
      </div>
      <div className={styles.body} data-appearance-body>
        <div className={styles.current}>
          <span>Applied</span>
          <strong>{saved.selected === 'custom' ? 'Custom colors' : (selected?.name ?? 'Default')}</strong>
          <span>{preview ? 'Unsaved preview · close to discard' : 'Current browser'}</span>
        </div>
        <div className={styles.tabs} role="group" aria-label="Appearance editor">
          <Button aria-pressed={tab === 'palettes'} onClick={() => setTab('palettes')}>
            Theme library <span>66</span>
          </Button>
          <Button aria-pressed={tab === 'custom'} onClick={() => setTab('custom')}>
            Custom colors
          </Button>
        </div>
        <p role="status" className={styles.status}>
          {message}
        </p>
        {error && <p role="alert">{error}</p>}
        {tab === 'palettes' ? (
          <>
            <div className={styles.filters}>
              <label>
                Find a theme
                <input
                  ref={search}
                  type="search"
                  maxLength={100}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, faction, House or dye"
                />
              </label>
              <label>
                Theme group
                <select value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="all">All groups</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={styles.hint}>
              {choices.length} choices
              <span className={styles.keyboardHint}>
                {' '}
                · Arrow keys, Home and End move through visible palettes. Enter applies.
              </span>
            </p>
            <div className={styles.library}>
              {groups.map((g) => {
                const rows = choices.filter((p) => p.group === g);
                return rows.length ? (
                  <section key={g} aria-label={g}>
                    <h3>{g}</h3>
                    {rows.map((p) => (
                      <Button
                        key={p.id}
                        data-palette-option={p.id}
                        aria-pressed={saved.selected === p.id}
                        className={styles.palette}
                        onClick={() => choose(p.id)}
                      >
                        <span className={styles.dyes} aria-hidden="true">
                          {(p.dyes ?? [p.colors.background, p.colors.panel, p.colors.accent, p.colors.secondary]).map(
                            (color, i) => (
                              <i key={i} style={{ backgroundColor: color }} />
                            ),
                          )}
                        </span>
                        <span className={styles.paletteName}>{p.name}</span>
                        <span className={styles.check} aria-hidden="true">
                          {saved.selected === p.id ? '✓' : '↗'}
                        </span>
                      </Button>
                    ))}
                  </section>
                ) : null;
              })}
            </div>
            {!choices.length && <p>No matching palettes. The applied choice remains visible above.</p>}
          </>
        ) : (
          <>
            <div className={styles.actions}>
              <Button
                onClick={() => {
                  setCustom({ ...colorsForPreference(saved) });
                  setError('');
                }}
              >
                Start from applied colors
              </Button>
              <Button
                onClick={() => {
                  setCustom({ ...defaultColors });
                  setError('');
                }}
              >
                Reset color draft
              </Button>
            </div>
            <p className={styles.hint}>
              Every surface, text, accent, border and status role is customizable. The shared engine fits surfaces and
              text for readable contrast. Adjusted colors are shown as applied values. Map categories, artwork, brand
              marks and game-data colors keep their meaning.
            </p>
            <div className={styles.colors}>
              {colorNames.map((name) => (
                <fieldset key={name}>
                  <legend>{colorLabels[name]}</legend>
                  <div className={styles.colorRow}>
                    <input
                      aria-label={`${colorLabels[name]} picker`}
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(custom[name]) ? custom[name] : defaultColors[name]}
                      onChange={(e) => setCustom({ ...custom, [name]: e.target.value })}
                    />
                    <input
                      aria-label={`${colorLabels[name]} hex`}
                      type="text"
                      maxLength={7}
                      value={custom[name]}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(e) => setCustom({ ...custom, [name]: e.target.value })}
                    />
                  </div>
                  {effective && <small>Applied {effective.colors[name]}</small>}
                </fieldset>
              ))}
            </div>
            {!parsed.success && (
              <p role="alert">
                Use six-digit hex colors, such as #182431. No CSS, URLs or transparency values are accepted.
              </p>
            )}
            <div
              className={styles.preview}
              style={
                effective
                  ? {
                      backgroundColor: effective.colors.panel,
                      color: effective.colors.text,
                      borderColor: effective.colors.border,
                    }
                  : undefined
              }
            >
              <p className={styles.eyebrow}>Live color sample</p>
              <h3 style={{ color: effective?.colors.text }}>Field briefing</h3>
              <p style={{ color: effective?.colors.muted }}>A calm canvas. Clear priorities. Your own palette.</p>
              <Button
                type="button"
                style={
                  effective
                    ? { backgroundColor: effective.colors.accent, color: effective.colors.background }
                    : undefined
                }
              >
                Ready for the desert
              </Button>
            </div>
            <div className={styles.actions}>
              <Button
                disabled={!parsed.success}
                onClick={() => {
                  if (parsed.success) {
                    applyAppearance({ ...saved, selected: 'custom', custom: parsed.data });
                    setPreview(true);
                    setMessage(
                      'Unsaved page preview. Apply custom colors to retain it, or close to restore your saved choice.',
                    );
                  }
                }}
              >
                Preview on dashboard
              </Button>
              <Button disabled={!parsed.success} className={styles.primary} onClick={() => choose('custom')}>
                Apply custom colors
              </Button>
              <Button
                onClick={() => {
                  const blob = new Blob(
                    [JSON.stringify({ version: 1, colors: parsed.success ? parsed.data : saved.custom })],
                    { type: 'application/json' },
                  );
                  downloadBlob(blob, 'arrakis-colors.json');
                }}
              >
                Export colors
              </Button>
            </div>
            <label className={styles.import}>
              Import color JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (file.size > 2048) {
                    setError('Color files must be at most 2 KiB.');
                    return;
                  }
                  try {
                    const raw = JSON.parse(await file.text());
                    if (raw?.version !== 1 || Object.keys(raw).sort().join(',') !== 'colors,version') throw new Error();
                    const next = colorsSchema.parse(raw.colors);
                    setCustom(next);
                    setError('');
                    setMessage('Colors imported into the draft. Preview or apply explicitly.');
                  } catch {
                    setError('Import a valid version-1 color file. No settings were changed.');
                  }
                }}
              />
            </label>
          </>
        )}
      </div>
      <footer className={styles.footer}>
        <p>Default clears saved overrides in this browser.</p>
        <Button onClick={reset}>Restore Default</Button>
        <Button className={styles.primary} onClick={onClose}>
          Done
        </Button>
      </footer>
    </dialog>
  );
}
