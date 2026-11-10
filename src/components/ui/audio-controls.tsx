'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CloseIcon } from '../icons';
import {
  audio,
  AUDIO_KEY,
  CATEGORIES,
  DEFAULT_AUDIO,
  LOCAL_DEALER_VOICE,
  parsePreferences,
  type AudioPreferences,
} from '../../lib/audio/manager';

function AudioSlider({
  label,
  value,
  onChange,
  speed = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  speed?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="flex items-center justify-between gap-3 text-xs text-sand-200">
        <span>{label}</span>
        <span aria-hidden="true" className="font-mono text-[0.6875rem] tabular-nums text-spice-300">
          {speed ? value.toFixed(2) + '×' : value === 0 ? 'Muted' : Math.round(value * 100) + '%'}
        </span>
      </span>
      <input
        aria-label={label}
        aria-valuetext={speed ? value.toFixed(2) + ' times' : Math.round(value * 100) + ' percent'}
        className="h-6 w-full min-w-0 cursor-pointer accent-spice-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spice-300"
        type="range"
        min={speed ? '0.7' : '0'}
        max={speed ? '1.3' : '1'}
        step="0.05"
        value={value}
        onChange={(event) => onChange(+event.target.value)}
      />
    </label>
  );
}

function AudioToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="relative flex min-h-11 cursor-pointer items-center justify-between gap-4 text-xs text-sand-100">
      <span>{label}</span>
      <input
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="flex h-5 w-9 shrink-0 items-center border border-sand-700 bg-obsidian-950 p-0.5 peer-checked:justify-end peer-checked:border-spice-400 peer-checked:bg-spice-400/15 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-spice-300"
      >
        <span className={checked ? 'h-3 w-3 bg-spice-300' : 'h-3 w-3 bg-sand-500'} />
      </span>
    </label>
  );
}

export function AudioControls() {
  const [prefs, setPrefs] = useState(DEFAULT_AUDIO);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [caption, setCaption] = useState('');
  const pathname = usePathname();
  const panel = useRef<HTMLDetailsElement>(null);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    try {
      const saved = parsePreferences(JSON.parse(localStorage.getItem(AUDIO_KEY) ?? 'null'));
      setPrefs(saved);
      audio.configure(saved);
    } catch {
      /* defaults */
    }
    audio.onCaption = setCaption;
    const updateVoices = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    updateVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', updateVoices);
    const click = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      audio.unlock();
      if (panel.current?.open && !panel.current.contains(event.target as Node)) panel.current.open = false;
      const target = (event.target as Element).closest<HTMLElement>(
        'a, button, summary, input[type="checkbox"], input[type="radio"]',
      );
      if (
        !target ||
        target.matches(':disabled,[aria-disabled="true"]') ||
        target.closest('[data-audio-settings],[data-casino-table]')
      )
        return;
      if (target instanceof HTMLAnchorElement) {
        if (event.ctrlKey || event.metaKey || event.shiftKey || target.target === '_blank') return;
        const url = new URL(target.href);
        if (url.origin === location.origin && url.pathname !== location.pathname) pending.current = url.pathname;
      } else if (target.matches('summary,[aria-haspopup],[aria-expanded]')) audio.play('menu');
      else if (!target.closest('form') && !target.matches('[type="submit"]')) audio.play('click');
    };
    let lastHover = 0;
    const hover = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !audio.preferences.hover || Date.now() - lastHover < 400) return;
      const target = (event.target as Element).closest('nav a,[data-audio-hover]');
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      lastHover = Date.now();
      audio.play('hover');
    };
    const visibility = () => {
      if (document.hidden) audio.cancel();
      else audio.setScene(location.pathname.startsWith('/casino'));
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel.current?.open) {
        panel.current.open = false;
        panel.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('click', click, true);
    document.addEventListener('pointerover', hover);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('click', click, true);
      document.removeEventListener('pointerover', hover);
      document.removeEventListener('visibilitychange', visibility);
      window.speechSynthesis?.removeEventListener('voiceschanged', updateVoices);
      audio.dispose();
    };
  }, []);
  useEffect(() => {
    audio.cancel();
    audio.setScene(pathname.startsWith('/casino'));
    if (pending.current === pathname) audio.play('navigation');
    pending.current = null;
  }, [pathname]);
  const change = (next: AudioPreferences) => {
    setPrefs(next);
    audio.configure(next);
    audio.unlock();
    audio.play('click');
    try {
      localStorage.setItem(AUDIO_KEY, JSON.stringify(next));
    } catch {
      /* session only */
    }
  };
  return (
    <>
      <details
        ref={panel}
        data-audio-settings
        className="group relative z-[60] border border-sand-700/50 bg-obsidian-950 text-sm text-sand-100 open:border-spice-400"
      >
        <summary
          className="grid size-11 cursor-pointer list-none place-items-center text-sand-300 hover:text-spice-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spice-300 group-open:text-spice-300 [&::-webkit-details-marker]:hidden"
          aria-label="Sound settings"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-5"
          >
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            {prefs.enabled ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 6 6m0-6-6 6" />}
          </svg>
          <span className="sr-only">Sound {prefs.enabled ? 'on' : 'off'}</span>
        </summary>
        <div className="fixed inset-x-4 top-20 mt-2 max-h-[calc(100dvh-6.5rem)] overflow-y-auto overscroll-contain border border-sand-700/70 border-t-spice-400 bg-obsidian-950 shadow-[8px_8px_0_rgb(0_0_0/0.45)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[22rem] sm:max-w-[calc(100vw-2rem)]">
          <div className="flex items-start justify-between gap-4 border-b border-sand-800 px-5 py-4">
            <div>
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.22em] text-spice-300">Audio preferences</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">Sound settings</h2>
            </div>
            <button
              type="button"
              aria-label="Close sound settings"
              className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center text-sand-400 hover:bg-sand-100/5 hover:text-sand-100 focus-visible:outline-2 focus-visible:outline-spice-300"
              onClick={() => {
                if (panel.current) panel.current.open = false;
                panel.current?.querySelector('summary')?.focus();
              }}
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <div className="border-b border-sand-800 bg-sand-100/[0.025] px-5 py-2">
            <AudioToggle
              label="Enable sound"
              checked={prefs.enabled}
              onChange={(enabled) => change({ ...prefs, enabled })}
            />
            <p className="pb-2 text-xs leading-relaxed text-sand-400">
              {prefs.enabled
                ? 'Your sound preferences are active.'
                : 'Turn on sound to hear effects and dealer voices.'}
            </p>
          </div>
          <fieldset className="min-w-0 space-y-2 border-b border-sand-800 px-5 pb-4">
            <legend className="pt-4 pb-3 font-mono text-[0.625rem] uppercase tracking-[0.2em] text-sand-400">
              Volume mixer
            </legend>
            <AudioSlider
              label="Master volume"
              value={prefs.master}
              onChange={(master) => change({ ...prefs, master })}
            />
            {CATEGORIES.map((category) => (
              <AudioSlider
                key={category}
                label={
                  { ui: 'Interface volume', casino: 'Casino volume', voice: 'Voice volume', ambient: 'Ambient volume' }[
                    category
                  ]
                }
                value={prefs.volumes[category]}
                onChange={(value) => change({ ...prefs, volumes: { ...prefs.volumes, [category]: value } })}
              />
            ))}
            <p className="text-[0.6875rem] text-sand-400">Set any volume to zero to mute it.</p>
          </fieldset>
          <fieldset className="min-w-0 space-y-3 border-b border-sand-800 px-5 pb-4">
            <legend className="pt-4 pb-3 font-mono text-[0.625rem] uppercase tracking-[0.2em] text-sand-400">
              Dealer & feedback
            </legend>
            <label className="grid min-w-0 gap-2 text-xs text-sand-200">
              Dealer voice
              <select
                aria-label="Dealer voice"
                className="h-11 w-full min-w-0 truncate border border-sand-700/60 bg-obsidian-900 px-3 text-xs text-sand-100 focus-visible:outline-2 focus-visible:outline-spice-300"
                value={prefs.voiceURI}
                onChange={(e) => change({ ...prefs, voiceURI: e.target.value })}
              >
                <option value={LOCAL_DEALER_VOICE}>Solaris dealer · local voice pack</option>
                <option value="device:default">Device default (fallback)</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
            <AudioSlider
              label="Speech speed"
              value={prefs.rate}
              speed
              onChange={(rate) => change({ ...prefs, rate })}
            />
            <div className="divide-y divide-sand-800">
              <AudioToggle
                label="Hover sounds"
                checked={prefs.hover}
                onChange={(hover) => change({ ...prefs, hover })}
              />
              <AudioToggle
                label="Dealer captions"
                checked={prefs.captions}
                onChange={(captions) => change({ ...prefs, captions })}
              />
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2 px-5 pt-4">
            <button
              type="button"
              className="min-h-11 min-w-0 border border-sand-700 bg-obsidian-900 px-2 py-2 font-mono text-[0.625rem] font-bold uppercase tracking-widest text-sand-100 hover:border-spice-400 hover:text-spice-300 focus-visible:outline-2 focus-visible:outline-spice-300"
              onClick={async () => {
                audio.unlock();
                const { default: pack } = await import('../../assets/audio/casino/solaris-v1/manifest.json');
                const text = 'Place your bets.';
                audio.announce({
                  id: `voice-preview:${Date.now()}`,
                  text,
                  priority: 4,
                  clips: [`/api/assets/audio/casino/solaris-v1/${pack.clips['place your bets.'].file}`],
                });
              }}
            >
              Preview voice
            </button>
            <button
              type="button"
              className="min-h-11 min-w-0 border border-sand-700 bg-obsidian-900 px-2 py-2 font-mono text-[0.625rem] font-bold uppercase tracking-widest text-sand-100 hover:border-spice-400 hover:text-spice-300 focus-visible:outline-2 focus-visible:outline-spice-300"
              onClick={() => {
                audio.unlock();
                audio.play('win');
              }}
            >
              Preview sound
            </button>
          </div>
          <p className="px-5 pt-3 pb-4 text-[0.6875rem] leading-relaxed text-sand-400">
            The local voice pack sounds the same on every device. Device voices are optional fallbacks.
          </p>
        </div>
      </details>
      {caption && prefs.captions && (
        <p
          className="fixed bottom-4 right-4 z-50 max-w-[min(24rem,calc(100vw-2rem))] border border-spice-700 bg-obsidian-950 p-3 text-sm text-sand-100"
          aria-hidden="true"
        >
          {caption}
        </p>
      )}
    </>
  );
}
