'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  audio,
  AUDIO_KEY,
  CATEGORIES,
  DEFAULT_AUDIO,
  LOCAL_DEALER_VOICE,
  parsePreferences,
  type AudioPreferences,
} from '../../lib/audio/manager';

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
        className="relative z-[60] border border-spice-700 bg-obsidian-950 text-sm text-sand-100"
      >
        <summary className="grid size-11 cursor-pointer list-none place-items-center" aria-label="Sound settings">
          <span aria-hidden="true">{prefs.enabled ? '♪' : '♩'}</span>
          <span className="sr-only">Sound {prefs.enabled ? 'on' : 'off'}</span>
        </summary>
        <div className="fixed right-4 top-20 mt-2 grid sm:absolute sm:right-0 sm:top-full max-h-[70dvh] w-64 max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto border border-spice-700 bg-obsidian-950 p-4 shadow-lg">
          <label>
            <input
              type="checkbox"
              checked={prefs.enabled}
              onChange={(e) => change({ ...prefs, enabled: e.target.checked })}
            />{' '}
            Enable sound
          </label>
          <label>
            Master volume
            <input
              className="w-full"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={prefs.master}
              onChange={(e) => change({ ...prefs, master: +e.target.value })}
            />
          </label>
          {CATEGORIES.map((category) => (
            <label key={category}>
              {category === 'ui' ? 'Interface' : category} volume
              <input
                className="w-full"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={prefs.volumes[category]}
                onChange={(e) => change({ ...prefs, volumes: { ...prefs.volumes, [category]: +e.target.value } })}
              />
            </label>
          ))}
          <label>
            Dealer voice
            <select
              aria-label="Dealer voice"
              className="w-full bg-obsidian-900"
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
          <label>
            Speech speed
            <input
              className="w-full"
              type="range"
              min="0.7"
              max="1.3"
              step="0.05"
              value={prefs.rate}
              onChange={(e) => change({ ...prefs, rate: +e.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.hover}
              onChange={(e) => change({ ...prefs, hover: e.target.checked })}
            />{' '}
            Hover sounds
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.captions}
              onChange={(e) => change({ ...prefs, captions: e.target.checked })}
            />{' '}
            Dealer captions
          </label>
          <button
            type="button"
            className="btn btn-ghost"
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
            Preview dealer voice
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              audio.unlock();
              audio.play('win');
            }}
          >
            Preview sound
          </button>
          <p className="text-xs text-sand-400">
            The local voice pack sounds consistent across devices. Device voices are optional fallbacks. Set a category
            to zero to mute it.
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
