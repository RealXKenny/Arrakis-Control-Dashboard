import { LEVEL_XP } from '../config/progression';
import { COLORS } from '../config/colors';

export function getLevelProgress(level, xp) {
  const numericLevel = Math.max(
    1,
    Math.min(200, Number(level) || 1)
  );

  const numericXp = Math.max(
    0,
    Number(xp) || 0
  );

  const currentLevelData =
    LEVEL_XP.find(
      (entry) => entry.level === numericLevel
    );

  const nextLevelData =
    LEVEL_XP.find(
      (entry) =>
        entry.level === numericLevel + 1
    );

  // Level 200 is the maximum.
  if (!nextLevelData) {
    return {
      percent: 100,
      currentXp: numericXp,
      levelStartXp:
        currentLevelData?.xp ?? 0,
      nextLevelXp: 344440,
      remainingXp: 0,
      maxLevel: true,
    };
  }

  const levelStartXp =
    currentLevelData?.xp ?? 0;

  const nextLevelXp =
    nextLevelData.xp;

  const levelRange =
    nextLevelXp - levelStartXp;

  const progressXp =
    Math.max(
      0,
      Math.min(
        levelRange,
        numericXp - levelStartXp
      )
    );

  return {
    percent:
      levelRange > 0
        ? (progressXp / levelRange) * 100
        : 0,
    currentXp: numericXp,
    levelStartXp,
    nextLevelXp,
    remainingXp: Math.max(
      0,
      nextLevelXp - numericXp
    ),
    maxLevel: false,
  };
}

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
