import { expect, it } from 'vitest';
import {
  portalLayoutSchema,
  portalLayoutRecordSchema,
  portalWidgetIds,
  personalPortalLayout,
  recommendedPortalLayout,
} from '../../../src/features/portal/layout';

it('defaults to a compact personal briefing without a guild while retaining every widget in the full preset', () => {
  expect(recommendedPortalLayout(false)).toEqual(personalPortalLayout());
  expect(recommendedPortalLayout(false).widgets).toEqual(['conditions', 'character', 'solaris', 'holdings', 'fleet']);
  expect(recommendedPortalLayout(false).density).toBe('compact');
  expect(recommendedPortalLayout(true)).toEqual({
    schemaVersion: 1,
    density: 'comfortable',
    widgets: [...portalWidgetIds],
  });
});
it('accepts private empty layouts and rejects duplicate, unsupported or executable widget configuration', () => {
  expect(portalLayoutSchema.safeParse({ schemaVersion: 1, density: 'compact', widgets: [] }).success).toBe(true);
  const layout = personalPortalLayout();
  for (const value of [
    { ...layout, widgets: ['character', 'character'] },
    { ...layout, widgets: ['foreign'] },
    { ...layout, widgets: Array(9).fill('conditions') },
    { ...layout, schemaVersion: 2 },
    { ...layout, density: 'custom' },
    { ...layout, href: 'https://foreign.test' },
    { ...layout, html: '<script/>' },
  ])
    expect(portalLayoutSchema.safeParse(value).success).toBe(false);
  expect(portalLayoutRecordSchema.safeParse({ revision: 'bad', layout }).success).toBe(false);
  expect(portalLayoutRecordSchema.safeParse({ revision: null, layout, owner: 'foreign' }).success).toBe(false);
});
