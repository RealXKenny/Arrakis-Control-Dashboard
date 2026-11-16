import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  activityViewSchema,
  activityRecordSchema,
  activityHref,
  defaultActivity,
  emptyActivities,
} from '../../../src/features/activity-views/model';
const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../../src/features/activity-views/server/store', () => ({ readActivityViews: state.read }));
vi.mock('../../../src/lib/assert-server', () => ({}));
import { resolveActivity } from '../../../src/features/activity-views/server/resolve';
const view = () => ({ ...defaultActivity(), id: randomUUID(), name: ' Exploration ' });
it('validates allowlisted widgets, filters and planning references without arbitrary navigation or snapshots', () => {
  expect(activityViewSchema.parse(view()).name).toBe('Exploration');
  for (const input of [
    { ...view(), href: 'https://foreign.test' },
    { ...view(), inventory: [] },
    { ...view(), portal: { ...view().portal, widgets: ['admin'] } },
    { ...view(), planning: { kind: 'project', id: 'foreign-key' } },
  ])
    expect(activityViewSchema.safeParse(input).success).toBe(false);
});
it('bounds record size by count, preserves empty layouts and rejects duplicate names and IDs', () => {
  const a = view();
  expect(activityViewSchema.safeParse({ ...a, portal: { ...a.portal, widgets: [] } }).success).toBe(true);
  expect(
    activityRecordSchema.safeParse({
      ...emptyActivities(),
      views: [a, { ...a, id: randomUUID(), name: 'exploration' }],
    }).success,
  ).toBe(false);
  expect(
    activityRecordSchema.safeParse({ ...emptyActivities(), views: [a, { ...a, name: 'Different' }] }).success,
  ).toBe(false);
  expect(
    activityRecordSchema.safeParse({
      ...emptyActivities(),
      views: Array.from({ length: 13 }, (_, n) => ({ ...view(), name: `View ${n}` })),
    }).success,
  ).toBe(false);
});
it('constructs only allowlisted workspace links from UUIDs', () => {
  const id = randomUUID();
  expect(activityHref('portal', id)).toBe(`/portal?activity=${id}`);
  expect(activityHref('tasks', '../admin')).toBe('/tasks');
});
it('resolves the current owner only and distinguishes absent, missing and unavailable definitions', async () => {
  state.read.mockReset();
  const a = view();
  state.read.mockResolvedValue({ ...emptyActivities(), views: [a] });
  expect(await resolveActivity('self', a.id)).toMatchObject({ status: 'ok', view: { id: a.id } });
  expect(state.read).toHaveBeenLastCalledWith('self');
  expect(await resolveActivity('self', undefined)).toEqual({ status: 'none' });
  expect(await resolveActivity('self', ['bad'])).toEqual({ status: 'missing' });
  expect(await resolveActivity('self', randomUUID())).toEqual({ status: 'missing' });
  state.read.mockRejectedValue(new Error('private storage detail'));
  expect(await resolveActivity('self', a.id)).toEqual({ status: 'unavailable' });
});
