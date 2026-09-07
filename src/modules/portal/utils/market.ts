/** Preserve PostgreSQL bigint quantities/prices when formatting for display. */
export function formatMarketNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value).toLocaleString('en-US');
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
}

export function getBuybackPercent(config) {
  return config?.buyback?.buybackPercent ?? config?.buybackSchedule?.buybackPercent ?? config?.schedule?.buybackPercent ?? config?.buybackPercent ?? null;
}
