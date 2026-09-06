export function clampPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, Math.min(100, number));
}

export function getBaseId(base) {
  return (
    base?.base_id ??
    base?.baseId ??
    base?.id ??
    base?.uuid ??
    null
  );
}

export function getNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

export function formatNumber(value, maximumFractionDigits = 1) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return number.toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

export function formatVolume(value) {
  return formatNumber(value, 1);
}

export function formatStorage(value) {
  return formatNumber(value, 1);
}