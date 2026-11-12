'use client';
import type { GameReward } from '../contracts';

export function GameRewardFields({ value, onChange }: { value?: GameReward; onChange(value?: GameReward): void }) {
  return (
    <>
      <label>
        Optional in-game reward
        <select
          value={value?.type ?? 'none'}
          onChange={(event) =>
            onChange(
              event.target.value === 'none'
                ? undefined
                : event.target.value === 'solaris'
                  ? { type: 'solaris', amount: '100' }
                  : { type: 'item', itemId: '', quantity: 1, quality: 0 },
            )
          }
        >
          <option value="none">Dashboard cosmetic only</option>
          <option value="solaris">Solaris</option>
          <option value="item">Item by template ID</option>
        </select>
      </label>
      {value?.type === 'solaris' && (
        <label>
          Whole Solaris (1–999999)
          <input
            required
            inputMode="numeric"
            pattern="[1-9][0-9]{0,5}"
            value={value.amount}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
          />
        </label>
      )}
      {value?.type === 'item' && (
        <>
          <label>
            Verified item template ID
            <input
              required
              maxLength={120}
              pattern="[A-Za-z0-9_]+"
              value={value.itemId}
              onChange={(e) => onChange({ ...value, itemId: e.target.value })}
            />
          </label>
          <label>
            Quantity (1–1000)
            <input
              type="number"
              required
              min={1}
              max={1000}
              value={value.quantity}
              onChange={(e) => onChange({ ...value, quantity: Number(e.target.value) })}
            />
          </label>
          <label>
            Item grade (0–5)
            <input
              type="number"
              required
              min={0}
              max={5}
              value={value.quality}
              onChange={(e) => onChange({ ...value, quality: Number(e.target.value) })}
            />
          </label>
        </>
      )}
      {value && (
        <p>
          Requires a claimed reward, separate administrator approval and offline delivery. This definition freezes on
          publication. Grade 0 physical schematics and entitlement cosmetics are unsupported.
        </p>
      )}
    </>
  );
}
