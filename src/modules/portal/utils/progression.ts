const COLORS = {
  red: 'var(--theme-danger)',
  gold: 'var(--theme-accent)',
  water: 'var(--theme-soft)',
};

export function getPowerColor(percent) {
  if (percent <= 10) {
    return COLORS.red;
  }

  if (percent <= 25) {
    return '#e5b85c';
  }

  return COLORS.gold;
}

export function getStorageColor(percent) {
  if (percent === null) {
    return '#a08568';
  }

  if (percent >= 90) {
    return COLORS.red;
  }

  if (percent >= 75) {
    return '#e5b85c';
  }

  return COLORS.gold;
}

export function getWaterColor(percent) {
  if (percent !== null && percent <= 10) {
    return COLORS.red;
  }

  if (percent !== null && percent <= 25) {
    return '#e5b85c';
  }

  return COLORS.water;
}
