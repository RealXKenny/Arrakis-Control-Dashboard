/** Calendar rules use one-based months and inclusive local calendar dates. */
export type CalendarRule =
  | { kind: 'fixed'; month: number; start: number; end?: number }
  | { kind: 'weekday'; month: number; weekday: number; occurrence: number; before?: number; after?: number }
  | { kind: 'easter'; before: number; after: number }
  | { kind: 'season'; start: number; end: number };

export interface ThemeDefinition {
  id: string;
  priority: number;
  rule: CalendarRule;
  /** Optional metadata for future decorative assets and banners; never injected as HTML. */
  /** Optional root class; the controller removes only classes it applied itself. */
  cssClass?: string;
  message?: string;
  asset?: string;
  palette: 'gold' | 'ice' | 'rose' | 'green' | 'spring' | 'patriotic' | 'autumn' | 'spooky' | 'festive';
}

/** Higher priorities win; ties retain matrix order. Single days override holiday periods. */
export const themeSchedule: ThemeDefinition[] = [
  { id: 'new-years', priority: 30, rule: { kind: 'fixed', month: 1, start: 1 }, palette: 'gold' },
  { id: 'mlk-day', priority: 30, rule: { kind: 'weekday', month: 1, weekday: 1, occurrence: 3 }, palette: 'gold' },
  { id: 'groundhog-day', priority: 30, rule: { kind: 'fixed', month: 2, start: 2 }, palette: 'autumn' },
  {
    id: 'game-day',
    priority: 30,
    rule: { kind: 'weekday', month: 2, weekday: 0, occurrence: 2, before: 1 },
    palette: 'green',
  },
  { id: 'valentine', priority: 20, rule: { kind: 'fixed', month: 2, start: 1, end: 14 }, palette: 'rose' },
  {
    id: 'presidents-day',
    priority: 30,
    rule: { kind: 'weekday', month: 2, weekday: 1, occurrence: 3 },
    palette: 'patriotic',
  },
  { id: 'st-patricks', priority: 30, rule: { kind: 'fixed', month: 3, start: 17 }, palette: 'green' },
  { id: 'easter', priority: 30, rule: { kind: 'easter', before: 2, after: 0 }, palette: 'spring' },
  { id: 'earth-day', priority: 30, rule: { kind: 'fixed', month: 4, start: 22 }, palette: 'green' },
  { id: 'cinco-de-mayo', priority: 30, rule: { kind: 'fixed', month: 5, start: 5 }, palette: 'festive' },
  { id: 'mothers-day', priority: 30, rule: { kind: 'weekday', month: 5, weekday: 0, occurrence: 2 }, palette: 'rose' },
  {
    id: 'memorial-day',
    priority: 30,
    rule: { kind: 'weekday', month: 5, weekday: 1, occurrence: -1, before: 2 },
    palette: 'patriotic',
  },
  { id: 'flag-day', priority: 30, rule: { kind: 'fixed', month: 6, start: 14 }, palette: 'patriotic' },
  { id: 'juneteenth', priority: 30, rule: { kind: 'fixed', month: 6, start: 19 }, palette: 'festive' },
  { id: 'fathers-day', priority: 30, rule: { kind: 'weekday', month: 6, weekday: 0, occurrence: 3 }, palette: 'ice' },
  { id: 'independence-day', priority: 20, rule: { kind: 'fixed', month: 7, start: 1, end: 5 }, palette: 'patriotic' },
  {
    id: 'labor-day',
    priority: 30,
    rule: { kind: 'weekday', month: 9, weekday: 1, occurrence: 1, before: 2 },
    palette: 'patriotic',
  },
  { id: 'patriot-day', priority: 30, rule: { kind: 'fixed', month: 9, start: 11 }, palette: 'patriotic' },
  {
    id: 'indigenous-peoples-day',
    priority: 30,
    rule: { kind: 'weekday', month: 10, weekday: 1, occurrence: 2 },
    palette: 'autumn',
  },
  { id: 'halloween', priority: 20, rule: { kind: 'fixed', month: 10, start: 1, end: 31 }, palette: 'spooky' },
  // First Monday plus one day also handles Novembers that begin on a Tuesday.
  {
    id: 'election-day',
    priority: 30,
    rule: { kind: 'weekday', month: 11, weekday: 1, occurrence: 1, after: 1, before: -1 },
    palette: 'patriotic',
  },
  { id: 'veterans-day', priority: 30, rule: { kind: 'fixed', month: 11, start: 11 }, palette: 'patriotic' },
  {
    id: 'thanksgiving',
    priority: 20,
    rule: { kind: 'weekday', month: 11, weekday: 4, occurrence: 4, after: 4 },
    palette: 'autumn',
  },
  { id: 'winter-holidays', priority: 20, rule: { kind: 'fixed', month: 12, start: 1, end: 31 }, palette: 'festive' },
  { id: 'new-years-eve', priority: 30, rule: { kind: 'fixed', month: 12, start: 31 }, palette: 'gold' },
  { id: 'winter', priority: 10, rule: { kind: 'season', start: 102, end: 228 }, palette: 'ice' },
  { id: 'spring', priority: 10, rule: { kind: 'season', start: 301, end: 531 }, palette: 'spring' },
  { id: 'summer', priority: 10, rule: { kind: 'season', start: 601, end: 831 }, palette: 'gold' },
  { id: 'autumn', priority: 10, rule: { kind: 'season', start: 901, end: 1130 }, palette: 'autumn' },
];

/** Self-contained so the exact tested resolver can also run in the early browser script. */
export function resolveTheme(
  date: Date,
  schedule: ThemeDefinition[],
  override?: string | null,
): ThemeDefinition | null {
  const requested = override === 'july4th' ? 'independence-day' : override;
  if (requested === 'default') return null;
  const forced = schedule.find((theme) => theme.id === requested);
  if (forced) return forced;
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  // UTC is only calendar arithmetic here: extract the user's local date first.
  // This avoids 23/25-hour DST days moving the inclusive range boundaries.
  const day = Date.UTC(year, date.getMonth(), date.getDate());
  let active: ThemeDefinition | null = null;
  for (const theme of schedule) {
    const rule = theme.rule;
    let start: number;
    let end: number;
    if (rule.kind === 'season') {
      const key = (date.getMonth() + 1) * 100 + date.getDate();
      if (key < rule.start || key > rule.end) continue;
      start = end = day;
    } else if (rule.kind === 'fixed') {
      start = Date.UTC(year, rule.month - 1, rule.start);
      end = Date.UTC(year, rule.month - 1, rule.end ?? rule.start);
    } else {
      let anchor: number;
      if (rule.kind === 'weekday') {
        const first = new Date(Date.UTC(year, rule.month - 1, 1));
        const last = new Date(Date.UTC(year, rule.month, 0));
        const number =
          rule.occurrence === -1
            ? last.getUTCDate() - ((last.getUTCDay() - rule.weekday + 7) % 7)
            : 1 + ((rule.weekday - first.getUTCDay() + 7) % 7) + 7 * (rule.occurrence - 1);
        anchor = Date.UTC(year, rule.month - 1, number);
      } else {
        // Gregorian computus (Western Easter), valid throughout the Gregorian calendar.
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const value = h + l - 7 * m + 114;
        anchor = Date.UTC(year, Math.floor(value / 31) - 1, (value % 31) + 1);
      }
      start = anchor - (rule.before ?? 0) * 86400000;
      end = anchor + (rule.after ?? 0) * 86400000;
    }
    if (day >= start && day <= end && (!active || theme.priority > active.priority)) active = theme;
  }
  return active;
}
