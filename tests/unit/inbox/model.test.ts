import { expect, it } from 'vitest';
import { assetAlerts, operationAlerts, supplyAlerts, inboxAlertSchema } from '../../../src/features/inbox/model';
import { buildPortalProfile } from '../../../src/features/portal/view-model';
import type { StoredResourceRequest } from '../../../src/features/guilds/resource-requests';
import type { StoredOperation } from '../../../src/features/guilds/operations';
const profile = () => buildPortalProfile({ details: {} });
it('never treats missing telemetry or generator defaults as low readings', () => {
  const p = profile();
  p.bases = [
    { id: 'x', name: 'Hidden', water: { percent: null }, storage: { percent: null }, runtime: { percent: 0 } },
  ] as typeof p.bases;
  expect(assetAlerts(p)).toEqual({ alerts: [], partial: true });
  p.bases = [];
  p.details = { bases: { rows: [] }, vehicles: { rows: [] } };
  expect(assetAlerts(p)).toEqual({ alerts: [], partial: false });
  p.details.vehicles = null;
  expect(assetAlerts(p)).toEqual({ alerts: [], partial: true });
});
it('uses inclusive documented thresholds, bounds and safe links without inventing container fuel', () => {
  const p = profile();
  p.bases = [{ id: "x'", name: 'Base', water: { percent: 10 }, storage: { percent: 90 } }] as typeof p.bases;
  p.vehicles = [{ id: 'van', name: 'Cargo', condition: 20, fuel: null }] as typeof p.vehicles;
  const result = assetAlerts(p);
  expect(result.alerts).toHaveLength(3);
  for (const alert of result.alerts) expect(inboxAlertSchema.safeParse(alert).success).toBe(true);
  expect(result.alerts[0].href).toContain('%27');
  p.bases = Array.from({ length: 21 }, (_, i) => ({ ...p.bases[0], id: String(i) }));
  expect(assetAlerts(p).alerts).toHaveLength(41);
  expect(assetAlerts(p).partial).toBe(true);
  p.bases[0].water.percent = -1;
  expect(assetAlerts(p).alerts.some((a) => a.id === 'base:0:water')).toBe(false);
});
it('shows supply work only when urgent, promised by self or reviewable without self-confirmation', () => {
  const r = {
    id: 'request',
    material: 'Iron',
    priority: 'normal',
    status: 'open',
    requesterId: 'requester',
    pledges: [{ supplierId: 'supplier', status: 'reported' }],
  } as StoredResourceRequest;
  expect(supplyAlerts([r], 'outsider', false)).toEqual([]);
  expect(supplyAlerts([r], 'supplier', true)).toEqual([]);
  expect(supplyAlerts([r], 'requester', false)[0].title).toContain('review');
  r.pledges[0].status = 'promised';
  expect(supplyAlerts([r], 'supplier', false)[0].title).toContain('pledge');
  r.status = 'fulfilled';
  expect(supplyAlerts([r], 'supplier', true)).toEqual([]);
});
it('shows upcoming and active operations, excludes closed/expired and respects 24-hour bounds', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const o = {
    id: 'op',
    title: 'Run',
    status: 'scheduled',
    startsAt: new Date(now + 3600000).toISOString(),
    endsAt: new Date(now + 7200000).toISOString(),
    signups: [{ memberId: 'self' }],
  } as StoredOperation;
  expect(operationAlerts([o], 'self', now)[0]).toMatchObject({
    priority: 'urgent',
    detail: expect.stringContaining('signed up'),
  });
  o.startsAt = new Date(now - 1000).toISOString();
  expect(operationAlerts([o], 'other', now)).toHaveLength(1);
  o.endsAt = new Date(now).toISOString();
  expect(operationAlerts([o], 'self', now)).toEqual([]);
  o.endsAt = new Date(now + 90000000).toISOString();
  o.startsAt = new Date(now + 86400001).toISOString();
  expect(operationAlerts([o], 'self', now)).toEqual([]);
  o.status = 'cancelled';
  expect(operationAlerts([o], 'self', now - 10000)).toEqual([]);
});
