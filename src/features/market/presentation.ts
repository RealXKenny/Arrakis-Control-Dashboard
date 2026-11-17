export function formatMarketNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value).toLocaleString('en-US');
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
}

export function getBuybackPercent(config) {
  return (
    config?.buyback?.buybackPercent ??
    config?.buybackSchedule?.buybackPercent ??
    config?.schedule?.buybackPercent ??
    config?.buybackPercent ??
    null
  );
}

export function getSuggestedSellPrice(price: unknown, percent: unknown): string | null {
  const priceText = typeof price === 'bigint' ? price.toString() : String(price ?? '').trim();
  const percentText = String(percent ?? '').trim();
  const percentMatch = /^(\d+)(?:\.(\d+))?$/.exec(percentText);

  if (!/^\d+$/.test(priceText) || !percentMatch) return null;

  const fraction = percentMatch[2] ?? '';
  const percentNumerator = BigInt(`${percentMatch[1]}${fraction}`);
  const percentScale = 10n ** BigInt(fraction.length);

  if (percentNumerator > 100n * percentScale) return null;

  return ((BigInt(priceText) * percentNumerator) / (100n * percentScale)).toString();
}
