'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoundView, WalletSnapshot } from '../contracts';
import { audio, type Sound } from '../../../lib/audio/manager';
import { narrateRound } from './narration';
import { CasinoError, casinoApi, newRequestKey } from './api';

const message = (error: unknown) =>
  error instanceof CasinoError ? error.message : 'Something went wrong. Please try again.';

/** The member's casino wallet, refreshed on demand and whenever the tab becomes visible again. */
export function useWallet(initial?: WalletSnapshot) {
  const [wallet, setWallet] = useState<WalletSnapshot | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setWallet(await casinoApi.wallet());
      setError(null);
    } catch (caught) {
      setError(message(caught));
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    if (!initial) void refresh();
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [initial, refresh]);

  return { wallet, refresh, error };
}

/**
 * One game's round lifecycle: resume an unfinished round after a reload, start, act, and report the
 * server's view. The browser never computes an outcome; it only renders what the server returned.
 */
export function useRound(game: string, onSettled?: () => void) {
  const [round, setRound] = useState<RoundView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const narrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (narrationTimer.current) clearTimeout(narrationTimer.current);
      audio.cancel();
    };
  }, []);
  const previousRef = useRef<RoundView | null>(null);
  const pendingKey = useRef<string | null>(null);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  const accept = useCallback((next: RoundView, narrate = false, action?: unknown) => {
    if (!mounted.current) return;
    if (narrate && !document.hidden) {
      const event = narrateRound(next, previousRef.current, action);
      if (event) {
        if (narrationTimer.current) clearTimeout(narrationTimer.current);
        const effect = (
          {
            'spice-wheel': 'wheel',
            'great-houses': 'coin',
            'fate-of-arrakis': 'dice',
            'spice-harvest': 'sand',
            'ornithopter-run': 'flight',
          } as Record<string, Sound>
        )[next.game];
        if (effect && (!previousRef.current || next.game === 'spice-harvest')) audio.play(effect, 'casino');
        if (next.game === 'emperors-hand') audio.play('deal', 'casino');
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : ((
              {
                'spice-wheel': 1400,
                'great-houses': 1000,
                'fate-of-arrakis': 350,
                'emperors-hand': 320,
                'spice-harvest': 250,
              } as Record<string, number>
            )[next.game] ?? 0);
        narrationTimer.current = setTimeout(() => {
          if (
            mounted.current &&
            !document.hidden &&
            previousRef.current?.id === next.id &&
            previousRef.current.version === next.version
          )
            audio.announce(
              next.status === 'open' && next.game === 'emperors-hand' ? { ...event, sound: undefined } : event,
            );
        }, duration);
      }
    }
    previousRef.current = next;
    setRound(next);
    if (next.status === 'settled' || next.status === 'voided') settledRef.current?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const open = (await casinoApi.openRounds()).find((row) => row.game === game);
        if (open && !cancelled) {
          const next = await casinoApi.view(open.id);
          if (!cancelled) accept(next);
        }
      } catch {
        // resuming is best-effort; starting a new round still works
      } finally {
        if (!cancelled) setResumed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game, accept]);

  const start = useCallback(
    async (wager: string, params: unknown) => {
      setBusy(true);
      setError(null);
      // A retry after a network failure reuses the key, so the server cannot start two rounds.
      pendingKey.current ??= newRequestKey();
      try {
        const next = await casinoApi.startRound(game, wager, params, pendingKey.current);
        pendingKey.current = null;
        accept(next, true);
        settledRef.current?.(); // the wager is held now, so the balance on screen must drop now
        return next;
      } catch (caught) {
        if (caught instanceof CasinoError && caught.code !== 'NETWORK') pendingKey.current = null;
        setError(message(caught));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [game, accept],
  );

  const act = useCallback(
    async (action: unknown) => {
      if (!round) return null;
      setBusy(true);
      setError(null);
      try {
        const next = await casinoApi.act(round.id, action);
        accept(next, true, action);
        return next;
      } catch (caught) {
        setError(message(caught));
        // The round may have moved on (a crash, or another tab); show the server's truth.
        try {
          accept(await casinoApi.view(round.id));
        } catch {
          // keep the previous view
        }
        return null;
      } finally {
        setBusy(false);
      }
    },
    [round, accept],
  );

  const refreshRound = useCallback(async () => {
    if (!round) return;
    try {
      accept(await casinoApi.view(round.id), true);
    } catch (caught) {
      setError(message(caught));
    }
  }, [round, accept]);

  const reset = useCallback(() => {
    audio.cancel();
    if (narrationTimer.current) clearTimeout(narrationTimer.current);
    previousRef.current = null;
    setRound(null);
    setError(null);
  }, []);

  const finished = round?.status === 'settled' || round?.status === 'voided';
  return { round, busy, error, start, act, reset, refreshRound, finished, open: round?.status === 'open', resumed };
}
