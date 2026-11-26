import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  convoySchema,
  operationDraftSchema,
  operationInputSchema,
  operationsView,
  settleOperation,
  storedOperationSchema,
  waypointMapHref,
  waypointSchema,
  type StoredOperation,
} from '../../../src/features/guilds/operations';
import { parseMapPin } from '../../../src/features/map/utils/pin';

const NOW = Date.parse('2027-01-02T10:00:00.000Z');
const at = (offset: number) => new Date(NOW + offset).toISOString();
function operation(overrides: Partial<StoredOperation> = {}): StoredOperation {
  return {
    id: randomUUID(),
    revision: randomUUID(),
    title: 'Spice run',
    kind: 'spice-run',
    details: '',
    meetingPoint: 'Base',
    startsAt: at(6 * 3_600_000),
    endsAt: at(8 * 3_600_000),
    roles: [
      { role: 'pilot', capacity: 1 },
      { role: 'scout', capacity: 1 },
    ],
    status: 'scheduled',
    organizerName: 'Leader',
    createdAt: at(-86_400_000),
    updatedAt: at(-86_400_000),
    signups: [],
    ...overrides,
  };
}
const signup = (memberId: string, role: 'pilot' | 'scout' = 'pilot') => ({
  id: randomUUID(),
  memberId,
  name: `Member ${memberId.length}`,
  role,
  signedUpAt: at(-3_600_000),
});
const waiter = (memberId: string, role: 'pilot' | 'scout', joined: number) => ({
  id: randomUUID(),
  memberId,
  name: `Waiter ${memberId.length}`,
  role,
  joinedAt: at(joined),
});

describe('N063 operation waitlists', () => {
  it('offers a freed seat to the earliest waiter for that role only, without signing them up', () => {
    const settled = settleOperation(
      operation({
        waitlist: [
          waiter('late', 'pilot', -1_000),
          waiter('early', 'pilot', -5_000),
          waiter('scouty', 'scout', -9_000),
        ],
      }),
      NOW,
    );
    expect(settled.invitations.map((entry) => entry.memberId).sort()).toEqual(['early', 'scouty']);
    expect(settled.waitlist.map((entry) => entry.memberId)).toEqual(['late']);
    expect(settled.signups).toEqual([]);
    expect(settled.invitations[0].expiresAt).toBe(at(2 * 3_600_000));
    expect(storedOperationSchema.safeParse(settled).success).toBe(true);
  });
  it('caps an invitation at the start time and drops expired offers so the next waiter is asked', () => {
    const soon = operation({ startsAt: at(30 * 60_000), endsAt: at(90 * 60_000) });
    expect(settleOperation({ ...soon, waitlist: [waiter('a', 'pilot', -1)] }, NOW).invitations[0].expiresAt).toBe(
      soon.startsAt,
    );
    const expired = operation({
      invitations: [{ ...waiter('a', 'pilot', -9_000), invitedAt: at(-7_300_000), expiresAt: at(-1) }],
      waitlist: [waiter('b', 'pilot', -5_000)],
    });
    const settled = settleOperation(expired, NOW);
    expect(settled.invitations.map((entry) => entry.memberId)).toEqual(['b']);
  });
  it('keeps waiters but clears offers once an operation starts or closes', () => {
    const started = operation({ startsAt: at(-60_000), waitlist: [waiter('a', 'pilot', -9_000)] });
    expect(settleOperation(started, NOW).invitations).toEqual([]);
    expect(
      settleOperation({ ...operation(), status: 'cancelled', waitlist: [waiter('a', 'pilot', -1)] }, NOW).invitations,
    ).toEqual([]);
  });
  it('does not offer seats that are already held by sign-ups or offers', () => {
    const full = operation({ signups: [signup('pilot')], waitlist: [waiter('a', 'pilot', -1)] });
    expect(settleOperation(full, NOW).invitations).toEqual([]);
  });
  it('rejects stored records where offers and sign-ups exceed capacity', () => {
    const invalid = operation({
      signups: [signup('pilot')],
      invitations: [{ ...waiter('a', 'pilot', -1), invitedAt: at(0), expiresAt: at(3_600_000) }],
    });
    expect(storedOperationSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('N064 and N067 member views', () => {
  it('shows only the briefing for the viewer role while leaders see all, and hides Console IDs', () => {
    const record = operation({
      briefings: { pilot: 'Fly low over the dunes.', scout: 'Watch for worm sign.' },
      signups: [
        { ...signup('console-pilot'), readiness: { status: 'ready', checked: [], note: 'Fuelled', updatedAt: at(0) } },
      ],
      waitlist: [waiter('console-waiter', 'pilot', -1)],
      screenshots: [
        { id: randomUUID(), caption: '', uploadedBy: 'Pilot', uploaderId: 'console-pilot', uploadedAt: at(0) },
      ],
    });
    const pilot = operationsView([record], 'console-pilot', false).operations[0];
    expect(pilot.briefings).toEqual({ pilot: 'Fly low over the dunes.' });
    expect(pilot.signups[0].readiness?.note).toBe('Fuelled');
    expect(pilot.screenshots[0].canRemove).toBe(true);
    expect(pilot.isParticipant).toBe(true);
    const outsider = operationsView([record], 'someone', false).operations[0];
    expect(outsider.briefings).toEqual({});
    expect(outsider.screenshots[0].canRemove).toBe(false);
    expect(operationsView([record], 'someone', true).operations[0].briefings).toEqual(record.briefings);
    const waiting = operationsView([record], 'console-waiter', false).operations[0];
    expect(waiting.waitlist[0]).toMatchObject({ isSelf: true, position: 1 });
    expect(JSON.stringify([pilot, outsider, waiting])).not.toMatch(/console-|memberId|uploaderId/);
  });
  it('accepts readiness only as status, preparation IDs and a bounded note', () => {
    const base = { action: 'readiness', id: randomUUID(), revision: randomUUID() };
    expect(
      operationInputSchema.safeParse({ ...base, readiness: { status: 'partial', checked: [randomUUID()], note: '' } })
        .success,
    ).toBe(true);
    expect(operationInputSchema.safeParse({ ...base, readiness: null }).success).toBe(true);
    expect(
      operationInputSchema.safeParse({
        ...base,
        readiness: { status: 'ready', checked: [], note: '', updatedAt: at(0) },
      }).success,
    ).toBe(false);
    expect(
      operationInputSchema.safeParse({ ...base, readiness: { status: 'ready', checked: [], note: 'x'.repeat(301) } })
        .success,
    ).toBe(false);
  });
  it('rejects unknown briefing roles and preparation items without IDs', () => {
    const draft = {
      id: randomUUID(),
      title: 'Run',
      kind: 'other',
      details: '',
      meetingPoint: 'Base',
      startsAt: at(3_600_000),
      endsAt: at(7_200_000),
      roles: [{ role: 'supplier', capacity: 2 }],
    };
    expect(operationDraftSchema.safeParse({ ...draft, briefings: { supplier: 'Bring water' } }).success).toBe(true);
    expect(operationDraftSchema.safeParse({ ...draft, briefings: { admiral: 'x' } }).success).toBe(false);
    expect(operationDraftSchema.safeParse({ ...draft, preparation: [{ text: 'Water' }] }).success).toBe(false);
  });
});

describe('N066 convoy and N068 waypoints', () => {
  it('assigns each crew member and fleet vehicle once and keeps quantities as whole-number strings', () => {
    const crew = randomUUID();
    const fleet = randomUUID();
    const vehicle = (patch = {}) => ({
      id: randomUUID(),
      fleetVehicleId: null,
      vehicleLabel: 'Carrier',
      crew: [crew],
      cargo: [{ item: 'Water', quantity: '1500' }],
      destination: 'Outpost',
      waypointId: null,
      ...patch,
    });
    expect(convoySchema.safeParse([vehicle()]).success).toBe(true);
    expect(convoySchema.safeParse([vehicle(), vehicle()]).success).toBe(false);
    expect(
      convoySchema.safeParse([
        vehicle({ crew: [], fleetVehicleId: fleet }),
        vehicle({ crew: [], fleetVehicleId: fleet }),
      ]).success,
    ).toBe(false);
    for (const quantity of ['0', '1.5', '-2', '1e3', '1234567890123'])
      expect(convoySchema.safeParse([vehicle({ cargo: [{ item: 'Water', quantity }] })]).success).toBe(false);
  });
  it('requires a sector or a full coordinate pair and links pinned waypoints to the existing map', () => {
    const base = { id: randomUUID(), label: 'Rally', purpose: 'rally', map: 'DeepDesert', note: '' };
    expect(waypointSchema.safeParse({ ...base, sector: null, x: null, y: null }).success).toBe(false);
    expect(waypointSchema.safeParse({ ...base, sector: null, x: 10, y: null }).success).toBe(false);
    expect(waypointSchema.safeParse({ ...base, sector: 'J1', x: null, y: null }).success).toBe(false);
    const sector = waypointSchema.parse({ ...base, sector: 'D5', x: null, y: null });
    expect(waypointMapHref(sector)).toBe('/map/deep-desert');
    const pinned = waypointSchema.parse({ ...base, map: 'HaggaBasin', sector: null, x: 1234.4, y: -56.6 });
    const href = waypointMapHref(pinned);
    expect(href).toBe('/map/hagga-basin?pin=1234%2C-57&label=Rally');
    expect(parseMapPin(Object.fromEntries(new URL(href, 'https://x.test').searchParams))).toEqual({
      x: 1234,
      y: -57,
      label: 'Rally',
    });
  });
  it('ignores malformed or oversized map pins', () => {
    for (const pin of ['', 'a,b', '1,2,3', '999999999,1', '1.5,2']) expect(parseMapPin({ pin })).toBeNull();
    expect(parseMapPin({ pin: '5,6', label: `  ${'x'.repeat(200)} ` })?.label).toHaveLength(80);
    expect(parseMapPin({ pin: ['5,6'] })?.label).toBe('Planning pin');
  });
});
