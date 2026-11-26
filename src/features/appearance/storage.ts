import { appearanceKey, appearanceCacheKey, defaultPreference, type AppearancePreference } from './model';
import { applyAppearance, normalizePreference } from './engine';
let current: AppearancePreference | null = null;
export function readAppearance(): AppearancePreference {
  if (current) return current;
  try {
    const raw = localStorage.getItem(appearanceKey);
    current = raw && raw.length <= 2048 ? normalizePreference(JSON.parse(raw)) : defaultPreference();
  } catch {
    current = defaultPreference();
  }
  return current;
}
export function restoreAppearance() {
  current = null;
  const pref = readAppearance();
  applyAppearance(pref);
  return pref;
}
export function saveAppearance(pref: AppearancePreference): boolean {
  current = normalizePreference(pref);
  const result = applyAppearance(current);
  try {
    if (current.selected === 'default') {
      localStorage.removeItem(appearanceKey);
      localStorage.removeItem(appearanceCacheKey);
    } else {
      const raw = JSON.stringify(current);
      localStorage.setItem(
        appearanceCacheKey,
        JSON.stringify({ version: 1, preference: raw, appearance: result!.appearance, tokens: result!.tokens }),
      );
      localStorage.setItem(appearanceKey, raw);
    }
    return true;
  } catch {
    return false;
  }
}
