import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { DuneConsoleClient } from '../../../server/integrations/dune';
import type { GameReward } from '../contracts';
import { fail } from './store';

/** Game writes need HTTPS, or plain HTTP only on this machine. */
export function isSecureConsoleOrigin(value: string | undefined) {
  if (!value || !URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  );
}
const whole = /^(0|[1-9][0-9]{0,24})$/;
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export function offline(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'offline';
}
export function deliveryAvailable() {
  const env = getServerEnv();
  return Boolean(env.DUNE_API_KEY && isSecureConsoleOrigin(env.DUNE_API_URL));
}
function client() {
  if (!deliveryAvailable())
    fail('Season game delivery is disabled or its administrator API connection is unavailable.', 403);
  const env = getServerEnv();
  return new DuneConsoleClient(env.DUNE_API_URL!, env.DUNE_API_KEY!);
}
type Currency = 'solaris' | 'house-credits';
const CURRENCY: Record<Currency, { id: 0 | 1; names: string[] }> = {
  solaris: { id: 0, names: ['0', 'solaris'] },
  'house-credits': { id: 1, names: ['1', 'housecredit'] },
};
export const currencyOf = (reward: GameReward): Currency | null =>
  reward.type === 'solaris' || reward.type === 'house-credits' ? reward.type : null;
/** Exactly one balance row must match; enum-mode databases report the currency by name, others by number. */
export function currencyBalance(payload: unknown, currency: Currency = 'solaris') {
  const rows = record(payload).rows;
  if (!Array.isArray(rows)) throw new Error('Invalid currency response.');
  const matches = rows
    .map(record)
    .filter((v) => CURRENCY[currency].names.includes(String(v.currency_id).toLowerCase()));
  const value = matches[0]?.balance;
  if (matches.length !== 1 || typeof value !== 'string' || !whole.test(value))
    throw new Error('Invalid currency response.');
  return BigInt(value);
}
export const solarisBalance = (payload: unknown) => currencyBalance(payload, 'solaris');
/** Official Console server.js/grantPlayerItem and duneDb.js/giveItemToPlayer receipts, reviewed at 480bb5f.
 * Broker publication, tasks, partial stacks and relog-required writes never count as confirmed delivery.
 */
export function confirmedGrant(payload: unknown, reward: GameReward, pawnId: string, expectedBalance?: bigint) {
  const root = record(payload);
  const result = record(root.result);
  if (root.ok === false || root.supported === false) return false;
  const currency = currencyOf(reward);
  if (currency) {
    const balance = record(result.balance);
    return (
      result.ok === true &&
      offline(record(result.player).onlineStatus) &&
      String(result.currencyId) === String(CURRENCY[currency].id) &&
      CURRENCY[currency].names.includes(String(balance.currency_id).toLowerCase()) &&
      result.amount === Number((reward as { amount: string }).amount) &&
      typeof balance.balance === 'string' &&
      whole.test(balance.balance) &&
      expectedBalance !== undefined &&
      BigInt(balance.balance) === expectedBalance
    );
  }
  if (reward.type !== 'item') return false;
  const item = record(root.item);
  if (
    root.ok !== true ||
    root.operation !== 'dbGiveItemToPlayer' ||
    result.ok !== true ||
    String(result.playerId) !== pawnId ||
    result.requiresRelog !== false ||
    result.clamped === true ||
    item.itemId !== reward.itemId ||
    item.quantity !== reward.quantity ||
    item.quality !== reward.quality
  )
    return false;
  const rows = Array.isArray(result.insertedStacks) ? result.insertedStacks : [result.inserted];
  if (!rows.length || rows.length > 1000) return false;
  let total = 0;
  const ids = new Set<string>();
  for (const raw of rows) {
    const row = record(raw);
    if (
      !row.id ||
      ids.has(String(row.id)) ||
      row.template_id !== reward.itemId ||
      row.quality_level !== reward.quality ||
      !Number.isSafeInteger(row.stack_size) ||
      Number(row.stack_size) < 1
    )
      return false;
    ids.add(String(row.id));
    total += Number(row.stack_size);
  }
  return total === reward.quantity && (result.given === undefined || result.given === reward.quantity);
}
export const deliveryGateway = {
  async balance(pawnId: string, currency: Currency = 'solaris') {
    return currencyBalance(
      await client().request('GET', `/api/players/${encodeURIComponent(pawnId)}/currency`, {
        timeoutMs: 5000,
        retryRead: false,
      }),
      currency,
    );
  },
  async grant(pawnId: string, reward: GameReward, expectedBalance?: bigint): Promise<'delivered' | 'uncertain'> {
    try {
      const item = reward.type === 'item';
      const currency = currencyOf(reward);
      const payload = await client().request(
        'POST',
        `/api/players/${encodeURIComponent(pawnId)}/${item ? 'give-item-id' : 'add-currency'}`,
        {
          body: item
            ? { itemId: reward.itemId, quantity: reward.quantity, quality: reward.quality }
            : {
                currencyId: CURRENCY[currency!].id,
                amount: Number((reward as { amount: string }).amount),
                confirmation: 'ADD CURRENCY',
              },
          timeoutMs: 15000,
          retryRead: false,
        },
      );
      return confirmedGrant(payload, reward, pawnId, expectedBalance) ? 'delivered' : 'uncertain';
    } catch {
      // Dev note: a sandworm ate the receipt; sending another parcel would only feed it twice.
      return 'uncertain';
    }
  },
};
