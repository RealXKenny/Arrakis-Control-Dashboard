import { appearanceKey, appearanceCacheKey, ownedColorProperties, colorNames } from './model';
import { appearancePalettes } from './catalog';
/** Static, nonce-protected bootstrap. Browser storage never becomes executable source. */
function boot(settings: {
  key: string;
  cacheKey: string;
  properties: string[];
  ids: string[];
  colors: readonly string[];
}) {
  try {
    const raw = localStorage.getItem(settings.key);
    if (!raw || raw.length > 2048) return;
    const stored = localStorage.getItem(settings.cacheKey);
    if (!stored || stored.length > 20000) return;
    const cache = JSON.parse(stored);
    if (cache?.version !== 1 || cache.preference !== raw || !['dark', 'light'].includes(cache.appearance)) return;
    const pref = JSON.parse(raw);
    if (
      !pref ||
      Object.keys(pref).sort().join(',') !== 'custom,selected,version' ||
      !settings.ids.includes(pref.selected) ||
      !pref.custom ||
      Object.keys(pref.custom).length !== settings.colors.length ||
      Object.entries(pref.custom).some(
        ([key, value]) => !settings.colors.includes(key) || typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value),
      )
    )
      return;
    if (pref?.version !== 1 || !/^(custom|[a-z][a-z0-9-]{1,63})$/.test(pref.selected) || pref.selected === 'default')
      return;
    const entries: [string, unknown][] = Object.entries(cache.tokens ?? {});
    if (
      entries.length !== settings.properties.length ||
      entries.some(
        ([key, value]) =>
          !settings.properties.includes(key) ||
          typeof value !== 'string' ||
          !(key.endsWith('-rgb')
            ? /^(?:\d{1,3} ){2}\d{1,3}$/.test(value) && value.split(' ').every((n) => Number(n) <= 255)
            : /^#[0-9a-f]{6}$/i.test(value)),
      )
    )
      return;
    for (const [key, value] of entries) document.documentElement.style.setProperty(key, value as string);
    document.documentElement.style.setProperty('color-scheme', cache.appearance);
    document.documentElement.dataset.appearance = pref.selected;
  } catch {
    /* Blocked/corrupt storage leaves the original stylesheet intact. */
  }
}
export function appearanceBootScript() {
  return `(${boot.toString()})(${JSON.stringify({ key: appearanceKey, cacheKey: appearanceCacheKey, properties: ownedColorProperties, ids: [...appearancePalettes.map((p) => p.id), 'custom'], colors: colorNames })});`;
}
