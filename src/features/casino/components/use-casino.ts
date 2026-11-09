'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoundView, WalletSnapshot } from '../contracts';
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
  const pendingKey = useRef<string | null>(null);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  const accept = useCallback((next: RoundView) => {
    setRound(next);
    if (next.status === 'settled' || next.status === 'voided') settledRef.current?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const open = (await casinoApi.openRounds()).find((row) => row.game === game);
        if (open && !cancelled) accept(await casinoApi.view(open.id));
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
        accept(next);
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
        accept(next);
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
      accept(await casinoApi.view(round.id));
    } catch (caught) {
      setError(message(caught));
    }
  }, [round, accept]);

  const reset = useCallback(() => {
    setRound(null);
    setError(null);
  }, []);

  const finished = round?.status === 'settled' || round?.status === 'voided';
  return { round, busy, error, start, act, reset, refreshRound, finished, open: round?.status === 'open', resumed };
}
