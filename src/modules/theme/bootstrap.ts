import { resolveTheme, themeSchedule, type ThemeDefinition } from './schedule';

/** Runs before body parsing. Only attributes change, so React markup and layout stay stable. */
export function startThemeController(resolve: typeof resolveTheme, schedule: ThemeDefinition[]) {
  let timer: ReturnType<typeof setTimeout>;
  let appliedClasses: string[] = [];
  function refresh() {
    clearTimeout(timer);
    const now = new Date();
    const theme = resolve(now, schedule, new URLSearchParams(window.location.search).get('theme'));
    const root = document.documentElement;
    root.dataset.theme = theme?.id ?? 'default';
    if (theme) root.dataset.themePalette = theme.palette;
    else root.removeAttribute('data-theme-palette');
    // Metadata remains text in attributes: no HTML injection or layout-changing banner.
    for (const [attribute, value] of [
      ['data-theme-message', theme?.message],
      ['data-theme-asset', theme?.asset],
    ]) {
      if (value) root.setAttribute(attribute, value);
      else root.removeAttribute(attribute);
    }
    const nextClasses = (theme?.cssClass ?? '').split(/\s+/).filter((name) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name));
    appliedClasses = appliedClasses.filter((name) => {
      if (nextClasses.includes(name)) return true;
      root.classList.remove(name);
      return false;
    });
    for (const name of nextClasses) {
      if (root.classList.contains(name)) continue;
      root.classList.add(name);
      appliedClasses.push(name);
    }
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
export function getThemeScript(schedule: ThemeDefinition[] = themeSchedule) {
  return `(${startThemeController.toString()})(${resolveTheme.toString()},${JSON.stringify(schedule)});`;
}
