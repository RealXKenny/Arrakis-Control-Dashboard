import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { recordAudit } from '../../../lib/security/audit';
import { consoleGateway, isOffline } from '../../casino/server/console-gateway';
import { deliveryAvailable } from '../../seasons/server/delivery-gateway';
import type { PrizeState, WeeklyPrize } from '../model';
import { WEEK_MS, addCredit, loadWeek, weekId, weekStart } from './weekly';

/**
 * Weekly prizes are paid only when the winner asks, from the same Solaris path the casino uses: the winner's
 * linked character must be Offline, the balance is read first, a durable "sending" marker is written before the
 * Console is contacted, and the payment counts only when the Console's reply confirms the exact new balance.
 * A reply that cannot be confirmed is never resent; it is left for an administrator to check.
 */
const ROOT = 'arrakis:solaris:weekly';
/** How many past weeks a prize can be collected for (week records are kept this long). */
const CLAIM_WEEKS = 8;
/** A "sending" marker older than this is an interrupted payment: never resent, shown as needing a check. */
const STUCK_MS = 120_000;
const RETAIN_MS = (CLAIM_WEEKS + 1) * WEEK_MS;

type ClaimRecord = { state: 'sending' | 'claimed' | 'uncertain'; playerId: string; amount: string; at: number };
const memory = new Map<string, ClaimRecord>();
const claimKey = (week: string, place: number) => `${ROOT}:${week}:prize:${place}`;

async function readClaim(week: string, place: number): Promise<ClaimRecord | null> {
  const client = getRedisClient();
  const raw = client
    ? await client.get<ClaimRecord>(claimKey(week, place))
    : (memory.get(claimKey(week, place)) ?? null);
  return raw && typeof raw === 'object' && typeof raw.state === 'string' ? raw : null;
}
async function writeClaim(week: string, place: number, record: ClaimRecord, onlyIfNew = false): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    if (onlyIfNew && memory.has(claimKey(week, place))) return false;
    memory.set(claimKey(week, place), record);
    return true;
  }
  const args = ['SET', claimKey(week, place), JSON.stringify(record), 'PX', RETAIN_MS];
  if (onlyIfNew) args.push('NX');
  return (await client.command(args)) === 'OK';
}
export function resetPrizesForTests() {
  memory.clear();
}

function stateOf(record: ClaimRecord | null, now: number): PrizeState {
  if (!record) return 'available';
  if (record.state === 'sending') return now - record.at > STUCK_MS ? 'uncertain' : 'sending';
  return record.state;
}

/** The member's prizes from closed weeks still open for collection, newest first. */
export async function prizesFor(playerId: string, now = Date.now()): Promise<WeeklyPrize[]> {
  const prizes: WeeklyPrize[] = [];
  const current = weekStart(now);
  for (let back = 1; back <= CLAIM_WEEKS; back++) {
    const week = await loadWeek(weekId(current - back * WEEK_MS));
    const winner = week?.closed?.winners.find((entry) => entry.id === playerId && BigInt(entry.prize) > 0n);
    if (!week || !winner) continue;
    prizes.push({
      weekId: week.id,
      place: winner.place,
      amount: winner.prize,
      state: stateOf(await readClaim(week.id, winner.place), now),
    });
  }
  return prizes;
}

const conflict = (message: string, status = 409): never => {
  throw new AppError(message, status, 'PRIZE_CONFLICT', true);
};

/**
 * Pay one weekly prize to the member's own linked character. `player` comes from a fresh linked-character check
 * made by the caller; nothing about the recipient is taken from the request.
 */
export async function claimPrize(
  week: string,
  player: { pawnId: string; onlineStatus: unknown },
  actor: string,
  now = Date.now(),
): Promise<{ state: PrizeState; amount: string }> {
  const record = await loadWeek(week);
  if (!record?.closed || now - record.endsAt > CLAIM_WEEKS * WEEK_MS)
    conflict('This week has no prizes to collect.', 404);
  const winner = record!.closed!.winners.find((entry) => entry.id === player.pawnId);
  if (!winner || BigInt(winner.prize) <= 0n) conflict('Your linked character did not win a prize that week.', 403);
  const { place, prize } = winner!;
  const existing = stateOf(await readClaim(week, place), now);
  if (existing === 'claimed') return { state: 'claimed', amount: prize };
  if (existing === 'sending') conflict('This prize is being paid right now. Refresh in a moment; nothing is resent.');
  if (existing === 'uncertain')
    conflict(
      'An earlier payment of this prize could not be confirmed. An administrator needs to check it; nothing was resent.',
    );
  if (!deliveryAvailable()) conflict('In-game prize payments are not configured on this dashboard yet.', 503);
  if (!isOffline(player.onlineStatus))
    conflict('Log out of Dune: Awakening before collecting your prize. Nothing was sent.');

  let balance: bigint;
  try {
    balance = await consoleGateway.getBalance(player.pawnId);
  } catch {
    // Nothing has been sent yet, so this is safe to try again.
    conflict('The game server did not answer. Nothing was sent; try again shortly.', 503);
  }
  const amount = BigInt(prize);
  // The marker is durable before the game is contacted, so a lost reply can never turn into a second payment.
  const marked = await writeClaim(
    week,
    place,
    { state: 'sending', playerId: player.pawnId, amount: prize, at: now },
    true,
  );
  if (!marked) conflict('This prize is already being collected. Refresh in a moment.');
  const outcome = await consoleGateway.adjust(player.pawnId, amount, balance! + amount);
  if (outcome === 'applied') {
    await writeClaim(week, place, { state: 'claimed', playerId: player.pawnId, amount: prize, at: Date.now() });
    // The prize lands in this week's balance; it must not count as this week's gain.
    await addCredit(player.pawnId, amount).catch(() => undefined);
    void recordAudit({ event: 'solaris.prize_paid', outcome: 'success', actor, data: { week, place, amount: prize } });
    return { state: 'claimed', amount: prize };
  }
  if (outcome === 'rejected') {
    // The Console refused before changing anything; the winner may try again.
    const client = getRedisClient();
    if (client) await client.del(claimKey(week, place));
    else memory.delete(claimKey(week, place));
    void recordAudit({ event: 'solaris.prize_rejected', outcome: 'failure', actor, data: { week, place } });
    conflict('The game server refused the payment. Nothing was paid; try again later.', 502);
  }
  await writeClaim(week, place, { state: 'uncertain', playerId: player.pawnId, amount: prize, at: Date.now() });
  void recordAudit({
    event: 'solaris.prize_uncertain',
    outcome: 'failure',
    actor,
    data: { week, place, amount: prize },
  });
  return { state: 'uncertain', amount: prize };
}
