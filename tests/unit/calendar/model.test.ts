import { expect, it } from 'vitest';
import { overlapsLocalDay, type CalendarItem } from '../../../src/features/calendar/model';

it('places multi-day items on each overlapping local day and excludes an end at midnight', () => {
  const day = new Date(2026, 2, 8);
  const previous = new Date(2026, 2, 7, 23);
  const following = new Date(2026, 2, 9);
  const item: CalendarItem = {
    id: '1',
    category: 'event',
    title: 'Event',
    description: '',
    startsAt: previous.toISOString(),
    endsAt: following.toISOString(),
    state: 'unspecified',
    href: '/events',
  };
  expect(overlapsLocalDay(item, day)).toBe(true);
  expect(overlapsLocalDay(item, following)).toBe(false);
  expect(overlapsLocalDay({ ...item, endsAt: null }, day)).toBe(false);
});
