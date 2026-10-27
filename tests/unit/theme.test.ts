import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme, themeSchedule } from '../../src/modules/theme/schedule';
import { getThemeScript } from '../../src/modules/theme/bootstrap';

const active = (value: string, override?: string) =>
  resolveTheme(new Date(`${value}T12:00:00`), themeSchedule, override)?.id ?? 'default';

describe('local theme calendar', () => {
  it.each([
    ['2026-01-01', 'new-years'],
    ['2026-01-19', 'mlk-day'],
    ['2026-02-02', 'groundhog-day'],
    ['2026-02-07', 'game-day'],
    ['2026-02-08', 'game-day'],
    ['2026-02-01', 'valentine'],
    ['2026-02-14', 'valentine'],
    ['2026-02-16', 'presidents-day'],
    ['2026-03-17', 'st-patricks'],
    ['2026-04-03', 'easter'],
    ['2026-04-05', 'easter'],
    ['2026-04-22', 'earth-day'],
    ['2026-05-05', 'cinco-de-mayo'],
    ['2026-05-10', 'mothers-day'],
    ['2026-05-23', 'memorial-day'],
    ['2026-05-25', 'memorial-day'],
    ['2026-06-14', 'flag-day'],
    ['2026-06-19', 'juneteenth'],
    ['2026-06-21', 'fathers-day'],
    ['2026-07-01', 'independence-day'],
    ['2026-07-05', 'independence-day'],
    ['2026-09-05', 'labor-day'],
    ['2026-09-07', 'labor-day'],
    ['2026-09-11', 'patriot-day'],
    ['2026-10-12', 'indigenous-peoples-day'],
    ['2026-10-01', 'halloween'],
    ['2026-10-31', 'halloween'],
    ['2026-11-03', 'election-day'],
    ['2022-11-08', 'election-day'],
    ['2026-11-11', 'veterans-day'],
    ['2026-11-26', 'thanksgiving'],
    ['2026-11-30', 'thanksgiving'],
    ['2026-12-01', 'winter-holidays'],
    ['2026-12-30', 'winter-holidays'],
    ['2026-12-31', 'new-years-eve'],
    ['2026-01-02', 'winter'],
    ['2026-02-28', 'winter'],
    ['2026-03-01', 'spring'],
    ['2026-05-31', 'spring'],
    ['2026-06-01', 'summer'],
    ['2026-08-31', 'summer'],
    ['2026-09-01', 'autumn'],
    ['2028-02-29', 'default'],
    ['2026-02-09', 'valentine'],
    ['2026-02-15', 'winter'],
    ['2026-04-02', 'spring'],
    ['2026-04-06', 'spring'],
    ['2026-05-22', 'spring'],
    ['2026-05-26', 'spring'],
    ['2026-07-06', 'summer'],
    ['2026-09-04', 'autumn'],
    ['2026-09-08', 'autumn'],
    ['2026-11-25', 'autumn'],
    ['2024-12-02', 'thanksgiving'],
    ['2024-03-29', 'easter'],
    ['2024-03-31', 'easter'],
    ['2038-04-25', 'easter'],
  ])('%s selects %s', (date, expected) => expect(active(date)).toBe(expected));

  it('allows only configured overrides and restores the default explicitly', () => {
    expect(active('2026-12-31', 'default')).toBe('default');
    expect(active('2026-12-31', 'july4th')).toBe('independence-day');
    expect(active('2026-12-31', 'easter')).toBe('easter');
    expect(active('2026-12-31', '<script>')).toBe('new-years-eve');
    expect(resolveTheme(new Date('invalid'), themeSchedule)).toBeNull();
    expect(resolveTheme(new Date(), [])).toBeNull();
  });

  it('uses local dates even when the same instant is a different UTC day', () => {
    const date = new Date('2026-07-06T02:00:00Z');
    vi.spyOn(date, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(date, 'getMonth').mockReturnValue(6);
    vi.spyOn(date, 'getDate').mockReturnValue(5);
    expect(resolveTheme(date, themeSchedule)?.id).toBe('independence-day');
  });
});

describe('early theme script lifecycle', () => {
  afterEach(() => vi.useRealTimers());

  it('refreshes at midnight, on navigation and on resume, clearing previous colors', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 30, 23, 59, 59));
    const listeners: Record<string, () => void> = {};
    const root = {
      dataset: {} as Record<string, string>,
      removeAttribute: (name: string) => {
        const key = name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
        delete root.dataset[key];
      },
    };
    const location = { search: '' };
    runInNewContext(getThemeScript(), {
      Date,
      URLSearchParams,
      setTimeout,
      clearTimeout,
      window: {
        location,
        addEventListener: (name: string, callback: () => void) => {
          listeners[name] = callback;
        },
      },
      document: {
        documentElement: root,
        addEventListener: (name: string, callback: () => void) => {
          listeners[name] = callback;
        },
      },
    });
    expect(root.dataset.theme).toBe('winter-holidays');
    vi.advanceTimersByTime(1000);
    expect(root.dataset.theme).toBe('new-years-eve');
    location.search = '?theme=default';
    listeners['theme-route-change']();
    expect(root.dataset).toEqual({ theme: 'default' });
    location.search = '?theme=july4th';
    listeners.popstate();
    expect(root.dataset.theme).toBe('independence-day');
    location.search = '';
    vi.setSystemTime(new Date(2027, 0, 1));
    listeners.visibilitychange();
    expect(root.dataset.theme).toBe('new-years');
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('theme configuration metadata', () => {
  it('applies and clears only its own classes and text metadata without creating layout elements', () => {
    const attributes = new Map<string, string>();
    const classes = new Set(['existing-app-class']);
    const root = {
      dataset: {} as Record<string, string>,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => {
        attributes.delete(name);
        if (name === 'data-theme-palette') delete root.dataset.themePalette;
      },
      classList: {
        add: (value: string) => classes.add(value),
        remove: (value: string) => classes.delete(value),
        contains: (value: string) => classes.has(value),
      },
    };
    const listeners: Record<string, () => void> = {};
    const location = { search: '?theme=custom-holiday' };
    runInNewContext(
      getThemeScript([
        {
          id: 'custom-holiday',
          priority: 30,
          palette: 'rose',
          rule: { kind: 'fixed', month: 2, start: 14 },
          cssClass: 'celebration existing-app-class',
          message: 'Happy day <friends>',
          asset: '/items/example.png',
        },
      ]),
      {
        Date,
        URLSearchParams,
        setTimeout: () => 1,
        clearTimeout: () => {},
        window: {
          location,
          addEventListener: (name: string, callback: () => void) => {
            listeners[name] = callback;
          },
        },
        document: { documentElement: root, addEventListener: () => {} },
      },
    );
    expect(root.dataset.theme).toBe('custom-holiday');
    expect(classes.has('celebration')).toBe(true);
    expect(attributes.get('data-theme-message')).toBe('Happy day <friends>');
    expect(attributes.get('data-theme-asset')).toBe('/items/example.png');
    location.search = '?theme=default';
    listeners.popstate();
    expect(root.dataset).toEqual({ theme: 'default' });
    expect([...classes]).toEqual(['existing-app-class']);
    expect(attributes.size).toBe(0);
  });
});
