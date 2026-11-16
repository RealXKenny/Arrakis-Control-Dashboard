export type CalendarItem = {
  id: string;
  category: 'event' | 'operation' | 'maintenance';
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  state: 'confirmed' | 'tentative' | 'cancelled' | 'unspecified';
  href: string;
};

export type CalendarData = {
  items: CalendarItem[];
  eventsAvailable: boolean;
  operationsState: 'available' | 'not-applicable' | 'unavailable';
  maintenanceAvailable: boolean;
  maintenanceObservedAt: string | null;
  unscheduledEvents: number;
};

/** Local calendar days use their actual boundaries, including daylight-saving transitions. */
export function overlapsLocalDay(item: CalendarItem, day: Date): boolean {
  const nextDay = new Date(day);
  nextDay.setDate(nextDay.getDate() + 1);
  const begins = Date.parse(item.startsAt);
  const ends = item.endsAt ? Date.parse(item.endsAt) : begins + 1;
  return begins < nextDay.getTime() && ends > day.getTime();
}
