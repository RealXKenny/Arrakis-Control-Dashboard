import { resolveTheme, themeSchedule, type ThemeDefinition } from './schedule';

/** Runs before body parsing. Only attributes change, so React markup and layout stay stable. */
export function startThemeController(resolve: typeof resolveTheme, schedule: ThemeDefinition[]) {
  let timer: ReturnType<typeof setTimeout>;
  function refresh() {
    clearTimeout(timer);
    const now = new Date();
    const theme = resolve(now, schedule, new URLSearchParams(window.location.search).get('theme'));
    const root = document.documentElement;
    root.dataset.theme = theme?.id ?? 'default';
    if (theme) root.dataset.themePalette = theme.palette;
    else root.removeAttribute('data-theme-palette');
    // Local midnight respects DST; the minute cap also catches system clock/timezone changes.
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(refresh, Math.min(60_000, Math.max(1, midnight.getTime() - now.getTime())));
  }
  window.addEventListener('theme-route-change', refresh);
  window.addEventListener('popstate', refresh);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  refresh();
}

/** No eval, inline script, request interpolation, or third-party dependency is needed. */
export function getThemeScript() {
  return `(${startThemeController.toString()})(${resolveTheme.toString()},${JSON.stringify(themeSchedule)});`;
}
