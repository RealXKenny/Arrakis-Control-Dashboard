import { expect, it, beforeEach, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { appearancePalettes } from '../../../src/features/appearance/catalog';
import {
  colorsSchema,
  defaultColors,
  defaultPreference,
  ownedColorProperties,
  appearanceKey,
  appearanceCacheKey,
} from '../../../src/features/appearance/model';
import { deriveAppearance, normalizePreference, applyAppearance } from '../../../src/features/appearance/engine';
import { parseHex, contrast, ensureContrast } from '../../../src/features/appearance/colors';
import { appearanceBootScript } from '../../../src/features/appearance/boot';
import { readAppearance, restoreAppearance, saveAppearance } from '../../../src/features/appearance/storage';
function root() {
  const values = new Map<string, string>();
  return {
    values,
    style: {
      setProperty: (key: string, value: string) => values.set(key, value),
      removeProperty: (key: string) => values.delete(key),
    },
    dataset: {} as Record<string, string>,
  };
}
const store = new Map<string, string>();
let documentRoot: ReturnType<typeof root>;
beforeEach(() => {
  store.clear();
  documentRoot = root();
  vi.stubGlobal('document', { documentElement: documentRoot });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  restoreAppearance();
});
it('matches PR #298: Default plus 19 Console, four faction and 42 House/outfit choices', () => {
  expect(appearancePalettes).toHaveLength(66);
  expect(new Set(appearancePalettes.map((p) => p.id)).size).toBe(66);
  expect(appearancePalettes.filter((p) => p.group === 'Console palettes')).toHaveLength(19);
  expect(appearancePalettes.filter((p) => p.group === 'Dune factions')).toHaveLength(4);
  expect(appearancePalettes.filter((p) => p.dyes)).toHaveLength(42);
  expect(defaultColors).toMatchObject({
    background: '#0d0f12',
    panel: '#171a1d',
    text: '#f3efe7',
    accent: '#c68b4a',
    muted: '#ad9f89',
  });
});
it('derives complete owned color roles and readable primary/muted/accent text for every named palette', () => {
  for (const p of appearancePalettes) {
    const result = deriveAppearance(p.colors);
    expect(Object.keys(result.tokens).sort(), p.id).toEqual([...ownedColorProperties].sort());
    for (const name of ['text', 'muted', 'accent', 'secondary', 'success', 'warning', 'danger'] as const)
      for (const surface of ['background', 'panel', 'raised'] as const)
        expect(
          contrast(parseHex(result.colors[name]), parseHex(result.colors[surface])),
          `${p.id}: ${name}/${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
    for (const [name, value] of Object.entries(result.tokens))
      expect(name.endsWith('-rgb') ? /^(\d{1,3} ){2}\d{1,3}$/.test(value) : /^#[0-9a-f]{6}$/.test(value)).toBe(true);
  }
});
it('fits hostile and light custom surfaces instead of accepting unreadable text combinations', () => {
  for (const background of ['#ffffff', '#000000', '#777777', '#222233', '#ffff00', '#ff00ff']) {
    const result = deriveAppearance({
      ...defaultColors,
      background,
      panel: '#000000',
      raised: '#ffffff',
      text: background,
      muted: background,
      accent: background,
    });
    for (const surface of ['background', 'panel', 'raised'] as const)
      for (const text of ['text', 'muted', 'accent'] as const)
        expect(contrast(parseHex(result.colors[text]), parseHex(result.colors[surface]))).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(ensureContrast([128, 128, 128], [[120, 120, 120]], 4.5), [120, 120, 120])).toBeGreaterThanOrEqual(
    4.5,
  );
});
it('validates preference shapes and excludes arbitrary CSS, URLs, alpha values and unknown palette IDs', () => {
  for (const accent of ['red', 'url(https://foreign.test)', 'expression(alert(1))', '#ffffff00', 'var(--other)'])
    expect(colorsSchema.safeParse({ ...defaultColors, accent }).success).toBe(false);
  expect(normalizePreference({ ...defaultPreference(), selected: 'removed-palette' })).toEqual(defaultPreference());
  expect(normalizePreference({ ...defaultPreference(), selected: 'custom', owner: 'someone' })).toEqual(
    defaultPreference(),
  );
});
it('persists a validated selection and cache, restores it and removes every override on Default', () => {
  const pref = { ...defaultPreference(), selected: 'dd-jade' };
  expect(saveAppearance(pref)).toBe(true);
  expect(store.has(appearanceCacheKey)).toBe(true);
  expect(restoreAppearance()).toEqual(pref);
  expect(documentRoot.dataset.appearance).toBe('dd-jade');
  documentRoot.values.set('--unrelated-setting', 'keep');
  saveAppearance(defaultPreference());
  expect(store.size).toBe(0);
  expect(documentRoot.values).toEqual(new Map([['--unrelated-setting', 'keep']]));
});
it('keeps page-local choices when browser storage is blocked', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error();
    },
    setItem: () => {
      throw new Error();
    },
    removeItem: () => {
      throw new Error();
    },
  });
  restoreAppearance();
  const pref = { ...defaultPreference(), selected: 'dd-basalt' };
  expect(saveAppearance(pref)).toBe(false);
  expect(readAppearance()).toEqual(pref);
  expect(documentRoot.dataset.appearance).toBe('dd-basalt');
});
it('bootstraps the exact validated cache without allowing unknown properties, stale schemas or malformed preferences', () => {
  const pref = { ...defaultPreference(), selected: 'dd-emerald' };
  saveAppearance(pref);
  const values = new Map(store);
  const cache = JSON.parse(values.get(appearanceCacheKey)!);
  function boot(changes: object = {}, preference = values.get(appearanceKey)!) {
    const target = root();
    runInNewContext(appearanceBootScript(), {
      localStorage: {
        getItem: (key: string) => (key === appearanceKey ? preference : JSON.stringify({ ...cache, ...changes })),
      },
      document: { documentElement: target },
    });
    return target;
  }
  expect(boot().dataset.appearance).toBe('dd-emerald');
  for (const changes of [
    { version: 0 },
    { appearance: 'wrong' },
    { tokens: { ...cache.tokens, '--font-sans': '#ffffff' } },
    { tokens: { ...cache.tokens, '--color-obsidian-950': 'url(https://foreign.test)' } },
    { tokens: { ...cache.tokens, '--theme-accent-rgb': '999 0 0' } },
  ])
    expect(boot(changes).values.size).toBe(0);
  const malformed = JSON.stringify({ ...pref, custom: { ...pref.custom, accent: 'url(https://foreign.test)' } });
  expect(boot({ preference: malformed }, malformed).values.size).toBe(0);
});
it('applying Default preserves unrelated element styles and sets no theme overrides', () => {
  const target = root();
  target.values.set('--font-sans', 'keep');
  applyAppearance(defaultPreference(), target as unknown as HTMLElement);
  expect(target.values.get('--font-sans')).toBe('keep');
  expect(target.dataset.appearance).toBeUndefined();
});
