import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { casinoRoundKeys } from '../../../lib/redis/keys';
import { recordAudit } from '../../../lib/security/audit';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import type { DashboardSession } from '../../auth/server/session-store';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { actOnRound, getRoundView, recoverRounds, startRound } from '../engine/round';
import type { RoundRecord, RoundView } from '../engine/types';
import { verifyRound } from '../fairness/verify';
import { gameRegistry } from '../games/registry';
import { recoverTransfers, resolveTransfer, startTransfer } from '../transfers/service';
import type { TransferIntent } from '../transfers/types';
import { consoleGateway, isOffline } from './console-gateway';
import { engineDeps } from './engine-deps';
import { listRounds, roundStore } from './round-store';
import { openRoundCount, readPublicSeedState, rotateSeed, setClientSeed } from './seed-store';
import { transferDeps } from './transfer-deps';
import { listTransfers, transferStore } from './transfer-store';
import { listWalletEntries, readWalletBalance } from './wallet-store';

/**
 * The Solaris Exchange application service. Every function takes the verified session and derives the
 * owner from it; nothing here accepts an owner, server, currency or balance from a request.
 *
 * All wagers are REAL in-game Solaris held in the member's casino wallet. Solaris reaches the wallet only by a
 * deposit the Console has confirmed, and leaves it only by a withdrawal the Console has confirmed. Everything is
 * refused unless `CASINO_SOLARIS_ENABLED` is true.
 */

/** The identifier of the game server the Console fronts. Wallets are per member per server. */
export const CASINO_SCOPE = 'arrakis';
export const PAUSE_HOURS = [1, 24, 168, 720] as const;
// Dev note: five tables is plenty; nobody out-multitasks a sandworm.
/** Unfinished rounds one member may hold at once. Each pins funds and the active seed, and a sweep slot. */
export const MAX_OPEN_ROUNDS = 5;

const ERRORS: Record<string, [number, string]> = {
  INSUFFICIENT_FUNDS: [409, 'Not enough Solaris in your casino wallet for that.'],
  INVALID_WAGER: [400, 'That wager is outside the table limits.'],
  INVALID_PARAMS: [400, 'Those game options are not valid.'],
  INVALID_ACTION: [400, 'That action is not valid.'],
  ILLEGAL_ACTION: [400, 'That action is not available right now.'],
  INVALID_REQUEST: [400, 'Invalid request.'],
  UNKNOWN_GAME: [404, 'Unknown game.'],
  NOT_FOUND: [404, 'Not found.'],
  ROUND_CLOSED: [409, 'This round has already finished.'],
  STATE_CONFLICT: [409, 'That changed while you were looking. Refresh and try again.'],
  INVALID_STATE: [409, 'That cannot be done in the current state.'],
  IDEMPOTENCY_CONFLICT: [409, 'That request key was already used with different options.'],
  ROUND_OPEN: [409, 'Finish your open rounds before rotating seeds.'],
  AmountError: [400, 'Invalid amount.'],
};

/** Turn engine and ledger failures into safe, exposed errors. Anything unrecognised stays a generic 500. */
export function toAppError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  const code = (error as { code?: unknown; name?: unknown } | null)?.code ?? (error as { name?: string } | null)?.name;
  const known = typeof code === 'string' ? ERRORS[code] : undefined;
  if (known) return new AppError(known[1], known[0], String(code), true);
  return error;
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toAppError(error);
  }
}

export function ownerOf(session: DashboardSession): string {
  const id = session.user.id;
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(id)) throw new AppError('Invalid account.', 403, 'FORBIDDEN', true);
  return id;
}

/** Table ceilings and the activation gate, read from the server environment on every call. */
export function casinoLimits() {
  const env = getServerEnv();
  return {
    enabled: env.CASINO_SOLARIS_ENABLED,
    maxWager: BigInt(env.CASINO_MAX_WAGER),
    maxPayout: BigInt(env.CASINO_MAX_PAYOUT),
  };
}

/** The server-enforced activation gate. Nothing that touches real Solaris runs without it. */
export function assertOpen(): void {
  if (!casinoLimits().enabled)
    throw new AppError(
      'The Solaris Exchange is closed. Real Solaris play is not enabled.',
      403,
      'FEATURE_DISABLED',
      true,
    );
}

async function limit(owner: string, bucket: string, max: number) {
  const result = await checkRateLimit(`casino:${bucket}:${owner}`, { limit: max, windowMs: 60_000 });
  if (!result.allowed)
    throw new AppError('You are going too fast. Take a breath and try again shortly.', 429, 'RATE_LIMITED', true);
}

let lastSweep = 0;
/** Opportunistic recovery so settlements, crashes, refunds and stuck transfers progress without a separate worker. */
function sweepSometimes() {
  if (Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  void recoverRounds(engineDeps()).catch(() => undefined);
  // Transfers recover even while the gate is closed, so anything in flight can still finish or be parked.
  void recoverTransfers(transferDeps()).catch(() => undefined);
}

// ---- voluntary pause ----------------------------------------------------------------------------------

const PAUSE_SCRIPT = `
local current = tonumber(redis.call('HGET', KEYS[1], 'pausedUntil') or '0')
local requested = tonumber(ARGV[1])
if requested > current then
  redis.call('HSET', KEYS[1], 'pausedUntil', ARGV[1])
  current = requested
end
return tostring(current)
`;

function redis() {
  const client = getRedisClient();
  if (!client) throw new AppError('The casino is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return client;
}

export async function pausedUntil(owner: string): Promise<number> {
  const value = await redis().command(['HGET', casinoRoundKeys.limits(owner, CASINO_SCOPE), 'pausedUntil']);
  const until = Number(value ?? 0);
  return Number.isFinite(until) && until > Date.now() ? until : 0;
}

async function assertNotPaused(owner: string) {
  if (await pausedUntil(owner))
    throw new AppError('You have paused play. It will resume automatically.', 403, 'PLAY_PAUSED', true);
}

/** A voluntary break. It can be extended but never shortened, so it cannot be undone on impulse. */
export async function pausePlay(session: DashboardSession, hours: number) {
  const owner = ownerOf(session);
  if (!(PAUSE_HOURS as readonly number[]).includes(hours))
    throw new AppError('Choose one of the offered break lengths.', 400, 'INVALID_REQUEST', true);
  const until = await redis().eval(
    PAUSE_SCRIPT,
    [casinoRoundKeys.limits(owner, CASINO_SCOPE)],
    [String(Date.now() + hours * 3_600_000)],
  );
  void recordAudit({ event: 'casino.play.paused', outcome: 'success', actor: owner, data: { hours } });
  return { pausedUntil: Number(until) };
}

// ---- wallet -------------------------------------------------------------------------------------------

export async function loadWallet(session: DashboardSession) {
  const owner = ownerOf(session);
  sweepSometimes();
  return guard(async () => {
    const [solaris, paused] = await Promise.all([
      readWalletBalance(owner, CASINO_SCOPE, 'solaris'),
      pausedUntil(owner),
    ]);
    const limits = casinoLimits();
    return {
      solaris: { available: solaris.available.toString(), reserved: solaris.reserved.toString() },
      pausedUntil: paused || null,
      enabled: limits.enabled,
      limits: { maxWager: limits.maxWager.toString(), maxPayout: limits.maxPayout.toString() },
    };
  });
}

export async function walletEntries(session: DashboardSession, offset = 0) {
  const entries = await guard(() =>
    listWalletEntries(ownerOf(session), CASINO_SCOPE, 'solaris', 25, Math.max(0, Math.trunc(offset))),
  );
  return entries.map((entry) => ({
    seq: entry.seq,
    id: entry.id,
    kind: entry.kind,
    holdId: entry.holdId,
    availableDelta: entry.availableDelta.toString(),
    reservedDelta: entry.reservedDelta.toString(),
    availableAfter: entry.availableAfter.toString(),
    reservedAfter: entry.reservedAfter.toString(),
  }));
}

// ---- Solaris transfers --------------------------------------------------------------------------------

export type PublicTransfer = {
  id: string;
  kind: TransferIntent['kind'];
  amount: string;
  state: TransferIntent['state'];
  failureCode: string | null;
  createdAt: number;
  updatedAt: number;
};

function publicTransfer(intent: TransferIntent): PublicTransfer {
  return {
    id: intent.id,
    kind: intent.kind,
    amount: intent.amount,
    state: intent.state,
    failureCode: intent.failureCode ?? null,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

/**
 * Move Solaris between the member's game character and their casino wallet. The player is the member's own
 * character, re-verified with the Discord adapter on every call (including that they are offline); no identifier
 * in the request is ever trusted.
 */
export async function startSolarisTransfer(
  session: DashboardSession,
  input: { kind: 'deposit' | 'withdrawal'; amount: unknown; idempotencyKey: string },
): Promise<PublicTransfer> {
  const owner = ownerOf(session);
  assertOpen();
  await limit(owner, 'transfer', 10);
  return guard(async () => {
    const player = await getLinkedPlayer({
      guildId: session.guildId,
      channelId: 'dashboard',
      userId: session.user.id,
      username: session.user.username,
      roleIds: session.roleIds || [],
      interactionId: `casino-${Date.now()}`,
      commandName: 'casino',
    });
    const playerId = player.linked ? (player.pawnId ?? player.controllerId) : null;
    if (!playerId) throw new AppError('Link your game character before moving Solaris.', 409, 'NOT_LINKED', true);
    // The Console writes the change to the database and loads it when the player next joins. A player who is online
    // could have it overwritten by their live session, so Solaris only moves while the character is logged out.
    // Anything other than a clear "Offline" counts as online. The Console's reply is checked again after the change.
    if (!isOffline(player.onlineStatus))
      throw new AppError(
        'Log out of the game first. Solaris can only be moved while your character is offline.',
        409,
        'PLAYER_ONLINE',
        true,
      );
    return publicTransfer(
      await startTransfer(transferDeps(), {
        kind: input.kind,
        owner,
        server: CASINO_SCOPE,
        playerId: String(playerId),
        amount: input.amount,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  });
}

export async function ownTransfers(session: DashboardSession): Promise<PublicTransfer[]> {
  const rows = await guard(() => listTransfers(ownerOf(session), CASINO_SCOPE, 25));
  return rows.map(publicTransfer);
}

export type AdminTransfer = PublicTransfer & {
  owner: string;
  playerId: string;
  gameBalance: string | null;
};

/** Transfers whose outcome is unknown. The game balance is read for the administrator; it is a hint, not proof. */
export async function adminTransfersAwaitingReconciliation(): Promise<AdminTransfer[]> {
  return guard(async () => {
    const refs = await transferStore.listOpen(0, 200);
    const found: AdminTransfer[] = [];
    for (const ref of refs) {
      const intent = await transferStore.get(ref);
      if (!intent || intent.state !== 'needs_reconciliation') continue;
      let gameBalance: string | null = null;
      try {
        gameBalance = (await consoleGateway.getBalance(intent.playerId)).toString();
      } catch {
        gameBalance = null;
      }
      found.push({ ...publicTransfer(intent), owner: intent.owner, playerId: intent.playerId, gameBalance });
    }
    return found;
  });
}

/** An administrator records what really happened to an uncertain transfer, after checking the game balance by hand. */
export async function adminResolveTransfer(
  admin: DashboardSession,
  ref: { owner: string; id: string },
  resolution: 'applied' | 'not_applied',
  note: string,
): Promise<PublicTransfer> {
  return guard(async () =>
    publicTransfer(
      await resolveTransfer(
        transferDeps(),
        { owner: ref.owner, server: CASINO_SCOPE, id: ref.id },
        resolution,
        admin.user.id,
        note,
      ),
    ),
  );
}

// ---- rounds -------------------------------------------------------------------------------------------

export async function startCasinoRound(
  session: DashboardSession,
  input: { game: string; wager: unknown; params?: unknown; idempotencyKey: string },
): Promise<RoundView> {
  const owner = ownerOf(session);
  assertOpen();
  await limit(owner, 'start', 40);
  await assertNotPaused(owner);
  const { maxWager } = casinoLimits();
  if (typeof input.wager === 'string' && /^[1-9][0-9]{0,14}$/.test(input.wager) && BigInt(input.wager) > maxWager)
    throw new AppError(`The largest wager is ${maxWager.toString()} Solaris.`, 400, 'INVALID_WAGER', true);
  return guard(async () => {
    // A retry of a start that already succeeded must return that round, not be refused by the cap.
    const existing = await roundStore.get({ owner, server: CASINO_SCOPE, id: `r_${input.idempotencyKey}` });
    if (!existing && (await openRoundCount(owner, CASINO_SCOPE)) >= MAX_OPEN_ROUNDS)
      throw new AppError('Finish one of your open rounds before starting another.', 409, 'TOO_MANY_OPEN_ROUNDS', true);
    return startRound(engineDeps(), { owner, server: CASINO_SCOPE, ...input });
  });
}

export async function actCasinoRound(session: DashboardSession, roundId: string, action: unknown): Promise<RoundView> {
  const owner = ownerOf(session);
  await limit(owner, 'act', 180);
  return guard(() => actOnRound(engineDeps(), { owner, server: CASINO_SCOPE, roundId, action }));
}

export async function viewCasinoRound(session: DashboardSession, roundId: string): Promise<RoundView> {
  const owner = ownerOf(session);
  await limit(owner, 'view', 600);
  return guard(() => getRoundView(engineDeps(), { owner, server: CASINO_SCOPE, id: roundId }));
}

export type RoundSummary = {
  id: string;
  game: string;
  status: RoundRecord['status'];
  wager: string;
  stake: string;
  createdAt: number;
  payout: string | null;
  net: string | null;
};

/** History rows never include hidden state; an open round shows only that it exists. */
export function summarise(round: RoundRecord): RoundSummary {
  const stake = BigInt(round.wager) * BigInt(round.holds);
  const finished = round.status === 'settled' && round.settlement;
  return {
    id: round.id,
    game: round.game,
    status: round.status,
    wager: round.wager,
    stake: stake.toString(),
    createdAt: round.createdAt,
    payout: finished ? round.settlement!.payout : null,
    net: finished ? (BigInt(round.settlement!.payout) - stake).toString() : null,
  };
}

/** The member's unfinished rounds (any game), so the interface can resume them after a reload. */
export async function openRounds(session: DashboardSession): Promise<RoundSummary[]> {
  const owner = ownerOf(session);
  const rounds = await guard(() => listRounds(owner, CASINO_SCOPE, 100));
  return rounds.filter((round) => round.status === 'open').map(summarise);
}

export async function casinoHistory(session: DashboardSession, limitRows = 25): Promise<RoundSummary[]> {
  const owner = ownerOf(session);
  const rounds = await guard(() => listRounds(owner, CASINO_SCOPE, limitRows));
  return rounds.map(summarise);
}

// ---- fairness -----------------------------------------------------------------------------------------

export async function fairnessState(session: DashboardSession) {
  return guard(() => readPublicSeedState(ownerOf(session), CASINO_SCOPE));
}

export async function rotateOwnSeed(session: DashboardSession, clientSeed?: string) {
  const owner = ownerOf(session);
  await limit(owner, 'seed', 10);
  const result = await guard(() => rotateSeed(owner, CASINO_SCOPE, clientSeed));
  // A rotation reveals a server seed, so it is worth a durable trace.
  void recordAudit({
    event: 'casino.seed.rotated',
    outcome: 'success',
    actor: owner,
    data: { rounds: result.revealed?.rounds ?? 0 },
  });
  return result;
}

export async function changeClientSeed(session: DashboardSession, clientSeed: string) {
  const owner = ownerOf(session);
  await limit(owner, 'seed', 10);
  return guard(() => setClientSeed(owner, CASINO_SCOPE, clientSeed));
}

/**
 * Independent-verification data for one of the caller's own finished rounds. The server seed is only
 * released once it has been retired (rotated), which cannot happen while any round is open.
 */
export async function verifyOwnRound(session: DashboardSession, roundId: string) {
  const owner = ownerOf(session);
  await limit(owner, 'verify', 60);
  return guard(async () => {
    const round = await roundStore.get({ owner, server: CASINO_SCOPE, id: roundId });
    if (!round) throw Object.assign(new Error('missing'), { code: 'NOT_FOUND' });
    if (round.status !== 'settled' || !round.seed || !round.settlement)
      return { verifiable: false as const, reason: 'ROUND_NOT_FINISHED' };
    const state = await readPublicSeedState(owner, CASINO_SCOPE);
    const retired = state.revealed.find((seed) => seed.commitment === round.seed!.commitment);
    if (!retired) return { verifiable: false as const, reason: 'SEED_NOT_RETIRED' };
    const mod = gameRegistry[round.game];
    if (!mod) return { verifiable: false as const, reason: 'UNKNOWN_GAME' };
    const inputs = {
      serverSeed: retired.serverSeed,
      commitment: round.seed.commitment,
      clientSeed: round.seed.clientSeed,
      nonce: round.seed.nonce,
      wager: BigInt(round.wager),
      params: round.params,
      actions: round.actions,
      startedAt: round.createdAt,
    };
    const verdict = verifyRound(mod, inputs, round.settlement);
    return {
      verifiable: true as const,
      ok: verdict.ok,
      reason: verdict.reason ?? null,
      game: round.game,
      inputs: { ...inputs, wager: round.wager },
    };
  });
}
