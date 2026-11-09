import type { HistoryRow, RoundView, TransferRow, WalletSnapshot } from '../contracts';

/** Browser client for the casino API. Everything is validated again on the server; this only transports. */

export class CasinoError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CasinoError';
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v2/casino/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new CasinoError('Could not reach the server. Check your connection and try again.', 'NETWORK', 0);
  }
  let data: { ok?: boolean; error?: string; code?: string } & Record<string, unknown> = {};
  try {
    data = (await response.json()) as typeof data;
  } catch {
    // fall through to the generic error below
  }
  if (!response.ok || data.ok === false)
    throw new CasinoError(
      data.error ?? 'Something went wrong. Please try again.',
      data.code ?? 'ERROR',
      response.status,
    );
  return data as T;
}

/** A fresh request key. Reusing it for a retry makes the server return the original result instead of repeating it. */
export const newRequestKey = () => crypto.randomUUID();

export const casinoApi = {
  wallet: async () => (await call<{ wallet: WalletSnapshot }>('wallet')).wallet,
  transfers: async () => (await call<{ transfers: TransferRow[] }>('transfers')).transfers,
  transfer: async (kind: 'deposit' | 'withdrawal', amount: string, idempotencyKey: string) =>
    (await call<{ transfer: TransferRow }>('transfers', { kind, amount, idempotencyKey })).transfer,
  adminTransfers: async () =>
    (
      await call<{ transfers: Array<TransferRow & { owner: string; playerId: string; gameBalance: string | null }> }>(
        'admin/transfers',
      )
    ).transfers,
  adminResolve: async (owner: string, id: string, resolution: 'applied' | 'not_applied', note: string) =>
    (await call<{ transfer: TransferRow }>('admin/transfers', { owner, id, resolution, note })).transfer,
  startRound: async (game: string, wager: string, params: unknown, idempotencyKey: string) =>
    (await call<{ round: RoundView }>('rounds', { game, wager, params, idempotencyKey })).round,
  act: async (roundId: string, action: unknown) =>
    (await call<{ round: RoundView }>(`rounds/${encodeURIComponent(roundId)}/action`, { action })).round,
  view: async (roundId: string) => (await call<{ round: RoundView }>(`rounds/${encodeURIComponent(roundId)}`)).round,
  openRounds: async () => (await call<{ rounds: HistoryRow[] }>('rounds?status=open')).rounds,
  history: async (limit = 25) => (await call<{ rounds: HistoryRow[] }>(`rounds?limit=${limit}`)).rounds,
  pause: async (pauseHours: number) => call<{ pausedUntil: number }>('limits', { pauseHours }),
  fairness: async () =>
    (
      await call<{
        fairness: {
          commitment: string | null;
          clientSeed: string | null;
          nonce: number;
          revealed: Array<{ commitment: string; serverSeed: string; rounds: number }>;
        };
      }>('fairness')
    ).fairness,
  rotateSeed: async (clientSeed?: string) =>
    call<{ revealed: { serverSeed: string; commitment: string; rounds: number } | null; nextCommitment: string }>(
      'fairness',
      { action: 'rotate', ...(clientSeed ? { clientSeed } : {}) },
    ),
  setClientSeed: async (clientSeed: string) => call<unknown>('fairness', { action: 'client-seed', clientSeed }),
  verify: async (roundId: string) =>
    (
      await call<{
        verification:
          | { verifiable: false; reason: string }
          | { verifiable: true; ok: boolean; reason: string | null; game: string; inputs: Record<string, unknown> };
      }>(`verify?round=${encodeURIComponent(roundId)}`)
    ).verification,
};
