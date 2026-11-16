import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { DuneConsoleClient } from '../../../server/integrations/dune';
import { isSecureConsoleOrigin } from '../../admin/server/execute';
import type { GameReward } from '../contracts';
import { fail } from './store';

const whole = /^(0|[1-9][0-9]{0,24})$/;
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export function offline(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'offline';
}
export function deliveryAvailable() {
  const env = getServerEnv();
  return Boolean(
    env.SEASON_GAME_DELIVERY_ENABLED && env.ADMIN_CONSOLE_API_KEY && isSecureConsoleOrigin(env.CONSOLE_URL),
  );
}
function client() {
  if (!deliveryAvailable())
    fail('Season game delivery is disabled or its administrator API connection is unavailable.', 403);
  const env = getServerEnv();
  return new DuneConsoleClient(env.CONSOLE_URL!, null, env.ADMIN_CONSOLE_API_KEY!);
}
export function solarisBalance(payload: unknown) {
  const rows = record(payload).rows;
  if (!Array.isArray(rows)) throw new Error('Invalid Solaris response.');
  const matches = rows.map(record).filter((v) => v.currency_id === 0 || v.currency_id === '0');
  const value = matches[0]?.balance;
  if (matches.length !== 1 || typeof value !== 'string' || !whole.test(value))
    throw new Error('Invalid Solaris response.');
  return BigInt(value);
}
/** Official Console server.js/grantPlayerItem and duneDb.js/giveItemToPlayer receipts, reviewed at 480bb5f.
 * Broker publication, tasks, partial stacks and relog-required writes never count as confirmed delivery.
 */
export function confirmedGrant(payload: unknown, reward: GameReward, pawnId: string, expectedBalance?: bigint) {
  const root = record(payload);
  const result = record(root.result);
  if (root.ok === false || root.supported === false) return false;
  if (reward.type === 'solaris') {
    const balance = record(result.balance);
    return (
      result.ok === true &&
      offline(record(result.player).onlineStatus) &&
      (result.currencyId === 0 || result.currencyId === '0') &&
      result.amount === Number(reward.amount) &&
      typeof balance.balance === 'string' &&
      whole.test(balance.balance) &&
      expectedBalance !== undefined &&
      BigInt(balance.balance) === expectedBalance
    );
  }
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
  async balance(pawnId: string) {
    return solarisBalance(
      await client().request('GET', `/api/players/${encodeURIComponent(pawnId)}/currency`, {
        timeoutMs: 5000,
        retryRead: false,
      }),
    );
  },
  async grant(pawnId: string, reward: GameReward, expectedBalance?: bigint): Promise<'delivered' | 'uncertain'> {
    try {
      const item = reward.type === 'item';
      const payload = await client().request(
        'POST',
        `/api/players/${encodeURIComponent(pawnId)}/${item ? 'give-item-id' : 'add-currency'}`,
        {
          body: item
            ? { itemId: reward.itemId, quantity: reward.quantity, quality: reward.quality }
            : { currencyId: 0, amount: Number(reward.amount), confirmation: 'ADD CURRENCY' },
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
