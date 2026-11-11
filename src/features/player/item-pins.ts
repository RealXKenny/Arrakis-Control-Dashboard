import { z } from 'zod';
import type { FinderResult } from './item-finder';

export const ITEM_PIN_LIMIT = 12;
export const itemPinSchema = z
  .object({ templateId: z.string().trim().min(1).max(128), name: z.string().trim().min(1).max(200) })
  .strict();
export const itemPinsSchema = z
  .array(itemPinSchema)
  .max(ITEM_PIN_LIMIT)
  .refine((pins) => new Set(pins.map((pin) => pin.templateId.toLowerCase())).size === pins.length);
export const itemPinsRecordSchema = z.object({ revision: z.uuid().nullable(), pins: itemPinsSchema }).strict();
export type ItemPin = z.infer<typeof itemPinSchema>;
export type ItemPinsRecord = z.infer<typeof itemPinsRecordSchema>;
export interface ItemCounter extends ItemPin {
  quantity: string;
  complete: boolean;
}
export type ItemPinReading = {
  counters: ItemCounter[];
  coverage: Omit<FinderResult, 'items'>;
  revision: string | null;
};

/** Counts observations only; failed sources and unknown quantities never become a complete zero. */
export function countPinnedItems(pins: ItemPin[], reading: FinderResult): ItemCounter[] {
  const coverageComplete =
    !reading.limited && reading.sources.length > 0 && reading.sources.every((source) => source.status === 'ok');
  return pins.map((pin) => {
    let quantity = 0n;
    let complete = coverageComplete;
    for (const item of reading.items) {
      if (item.templateId.toLowerCase() !== pin.templateId.toLowerCase()) continue;
      if (/^[0-9]{1,200}$/.test(item.quantity)) quantity += BigInt(item.quantity);
      else complete = false;
    }
    return { ...pin, quantity: String(quantity), complete };
  });
}
