import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  linked: vi.fn(),
  request: vi.fn(),
  limit: vi.fn(),
  budget: vi.fn(),
  vehicles: vi.fn(),
  operations: vi.fn(),
  documents: new Map<string, { revision: string } & Record<string, unknown>>(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: mocks.budget }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/features/vehicles/server/load', () => ({ loadVehicles: mocks.vehicles }));
vi.mock('../../src/features/guilds/server/operations-store', () => ({ readGuildOperations: mocks.operations }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://dashboard.test', NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }),
}));
// In-memory CAS documents with the same contract as the Redis store; real Lua is covered by integration tests.
vi.mock('../../src/features/guilds/server/logistics-store', () => {
  const conflict = () => new AppError('This plan changed.', 409, 'LOGISTICS_CONFLICT', true);
  const key = (guild: string, section: string) => `${section}:${guild}`;
  async function readLogistics(guild: string, section: string, schema: { parse(value: unknown): unknown }) {
    const value = mocks.documents.get(key(guild, section));
    return value ? schema.parse(structuredClone(value)) : null;
  }
  async function writeLogistics(
    guild: string,
    section: string,
    schema: { parse(value: unknown): unknown },
    expected: string | null,
    next: Record<string, unknown> | null,
  ) {
    if ((mocks.documents.get(key(guild, section))?.revision ?? null) !== expected) throw conflict();
    if (!next) {
      mocks.documents.delete(key(guild, section));
      return null;
    }
    const revision = randomUUID();
    mocks.documents.set(key(guild, section), schema.parse({ ...next, revision }) as { revision: string });
    return revision;
  }
  async function updateOwnLogistics(
    guild: string,
    section: string,
    schema: { parse(value: unknown): unknown },
    mutate: (value: unknown) => Record<string, unknown> | null,
  ) {
    const current = (await readLogistics(guild, section, schema)) as { revision: string } | null;
    const value = mutate(current);
    return { revision: await writeLogistics(guild, section, schema, current?.revision ?? null, value), value };
  }
  return { readLogistics, writeLogistics, updateOwnLogistics };
});
import { GET, POST } from '../../src/app/api/v2/guilds/[guildId]/logistics/route';
import { memberRef, resetLandsraadCache } from '../../src/features/guilds/server/logistics-http';

const roster = (leader = false) => ({
  rows: [
    { player_id: 'self-pawn', controller_id: 'self-controller', role_id: leader ? 100 : 1, character_name: 'Self' },
    { player_id: 'other-pawn', role_id: 1, character_name: 'Other' },
  ],
});
let asLeader = false;
let landsraad: unknown = {};
const context = () => ({ params: Promise.resolve({ guildId: '2' }) });
const read = async (query: string) => {
  const response = await GET(new Request(`https://dashboard.test/api/v2/guilds/2/logistics?${query}`), context());
  return { status: response.status, body: await response.json() };
};
const write = async (section: string, input: unknown, origin = 'https://dashboard.test') => {
  const response = await POST(
    new Request('https://dashboard.test/api/v2/guilds/2/logistics', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, input }),
    }),
    context(),
  );
  return { status: response.status, body: await response.json() };
};
const vehicle = (id: string, access: 'owned' | 'shared' = 'owned') => ({
  id,
  name: `Carrier ${id}`,
  type: 'Carrier',
  owner: 'Self',
  access,
  condition: 80,
  fuel: { percent: 55, current: 55 },
  storage: { used: 10, max: 100, unit: 'slots' },
  image: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.documents.clear();
  resetLandsraadCache();
  asLeader = false;
  landsraad = {};
  mocks.session.mockResolvedValue({ user: { id: 'discord-self', username: 'Self' }, guildId: 'g', roleIds: [] });
  mocks.linked.mockResolvedValue({ linked: true, pawnId: 'self-pawn', controllerId: 'self-controller' });
  mocks.request.mockImplementation(async (_method: string, route: string) =>
    route.includes('/landsraad') ? landsraad : roster(asLeader),
  );
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.budget.mockResolvedValue({ allowed: true });
  mocks.vehicles.mockResolvedValue({
    status: 'ok',
    playerName: 'Self',
    vehicles: [vehicle('veh-1'), vehicle('veh-2', 'shared')],
  });
  mocks.operations.mockResolvedValue([]);
});

describe('guild logistics API access', () => {
  it('requires a signed-in current member, a known section and same-origin writes', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await read('section=templates')).status).toBe(401);
    expect((await read('section=unknown')).status).toBe(400);
    mocks.request.mockResolvedValueOnce({ rows: [{ player_id: 'someone-else', role_id: 100 }] });
    expect((await read('section=templates')).status).toBe(403);
    expect((await write('templates', {}, 'https://evil.test')).status).toBe(403);
    mocks.limit.mockResolvedValueOnce({ allowed: false });
    expect((await read('section=fleet')).status).toBe(429);
  });
});

describe('N061 templates API', () => {
  const template = () => ({
    id: randomUUID(),
    name: 'Weekly spice',
    kind: 'spice-run',
    title: 'Spice run',
    details: '',
    meetingPoint: 'Base',
    durationMinutes: 90,
    roles: [{ role: 'pilot', capacity: 1 }],
    preparation: [],
    briefings: {},
    waypoints: [],
    notes: '',
    cadence: 'weekly',
    weekday: 6,
    time: '19:00',
    timeZone: 'UTC',
  });
  it('lets members read but only leaders save, with revision checks', async () => {
    expect((await write('templates', { action: 'save', revision: null, template: template() })).status).toBe(403);
    asLeader = true;
    const saved = await write('templates', { action: 'save', revision: null, template: template() });
    expect(saved.status).toBe(200);
    expect(saved.body.data.templates).toHaveLength(1);
    expect((await write('templates', { action: 'save', revision: null, template: template() })).status).toBe(409);
    asLeader = false;
    const view = await read('section=templates');
    expect(view.body.data).toMatchObject({ canEdit: false, templates: [{ name: 'Weekly spice', updatedBy: 'Self' }] });
  });
});

describe('N062 availability API', () => {
  it('saves only the caller entry and hides Console IDs', async () => {
    const availability = {
      timeZone: 'Europe/Berlin',
      windows: [{ day: 2, start: '19:00', end: '23:00' }],
      note: 'Evenings',
    };
    expect((await write('availability', { action: 'save', availability, memberId: 'other-pawn' })).status).toBe(400);
    const saved = await write('availability', { action: 'save', availability });
    expect(saved.body.data.entries).toEqual([
      expect.objectContaining({ name: 'Self', isSelf: true, note: 'Evenings' }),
    ]);
    expect(JSON.stringify(saved.body)).not.toMatch(/self-pawn|memberId/);
    // A former member's stale entry disappears from the board.
    mocks.request.mockImplementation(async () => ({
      rows: [
        { player_id: 'other-pawn', role_id: 1, character_name: 'Other' },
        { player_id: 'self-pawn', role_id: 1, character_name: 'Self' },
      ],
    }));
    const document = mocks.documents.get('availability:2')!;
    (document.entries as Array<Record<string, unknown>>).push({
      ...(document.entries as Array<Record<string, unknown>>)[0],
      id: randomUUID(),
      memberId: 'departed',
      name: 'Departed',
    });
    expect((await read('section=availability')).body.data.entries.map((entry: { name: string }) => entry.name)).toEqual(
      ['Self'],
    );
    const cleared = await write('availability', { action: 'clear' });
    expect(cleared.body.data.entries).toEqual([]);
  });
});

describe('N065 fleet API', () => {
  async function publish(vehicleRef = 'veh-1') {
    const current = await read('section=fleet');
    return write('fleet', { action: 'publish', revision: current.body.data.revision, vehicleRef, notes: 'Cargo runs' });
  }
  it('publishes only vehicles the linked character owns and never exposes vehicle or member IDs', async () => {
    const candidates = await read('section=fleet&candidates=1');
    expect(candidates.body.data.candidates.vehicles.map((entry: { vehicleRef: string }) => entry.vehicleRef)).toEqual([
      'veh-1',
    ]);
    expect((await publish('veh-2')).status).toBe(403);
    expect((await publish('missing')).status).toBe(403);
    const published = await publish();
    expect(published.status).toBe(200);
    expect(published.body.data.vehicles[0]).toMatchObject({
      name: 'Carrier veh-1',
      isOwn: true,
      condition: 80,
      fuelPercent: 55,
    });
    expect(JSON.stringify(published.body)).not.toMatch(/"veh-1"|self-pawn|other-pawn|ownerId|vehicleRef/);
    expect((await publish()).status).toBe(409);
  });
  it('books with roster pilots and refuses vehicle or pilot overlaps', async () => {
    await publish();
    let view = (await read('section=fleet')).body.data;
    const self = view.pilots.find((pilot: { isSelf: boolean }) => pilot.isSelf).ref;
    expect(self).toBe(memberRef('2', 'self-pawn'));
    const start = Date.now() + 3_600_000;
    const booking = (patch: Record<string, unknown> = {}) => ({
      id: randomUUID(),
      vehicleId: view.vehicles[0].id,
      operationId: null,
      purpose: 'Spice haul',
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + 7_200_000).toISOString(),
      pilotRef: self,
      ...patch,
    });
    const saved = await write('fleet', { action: 'reserve', revision: view.revision, reservation: booking() });
    expect(saved.status).toBe(200);
    view = saved.body.data;
    expect(view.reservations[0]).toMatchObject({ pilotName: 'Self', isPilotSelf: true, canCancel: true });
    const clash = await write('fleet', {
      action: 'reserve',
      revision: view.revision,
      reservation: booking({ pilotRef: memberRef('2', 'other-pawn') }),
    });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('LOGISTICS_BOOKING_CONFLICT');
    expect(
      (
        await write('fleet', {
          action: 'reserve',
          revision: view.revision,
          reservation: booking({ pilotRef: 'f'.repeat(24) }),
        })
      ).body.code,
    ).toBe('LOGISTICS_MEMBER_GONE');
    expect(
      (
        await write('fleet', {
          action: 'reserve',
          revision: view.revision,
          reservation: booking({ endsAt: new Date(start + 49 * 3_600_000).toISOString() }),
        })
      ).status,
    ).toBe(400);
    // A different member who is neither owner nor leader cannot book or cancel.
    mocks.linked.mockResolvedValue({ linked: true, pawnId: 'other-pawn' });
    const other = (await read('section=fleet')).body.data;
    expect(other.reservations[0].canCancel).toBe(false);
    expect((await write('fleet', { action: 'reserve', revision: other.revision, reservation: booking() })).status).toBe(
      403,
    );
    expect(
      (await write('fleet', { action: 'cancel', revision: other.revision, reservationId: other.reservations[0].id }))
        .status,
    ).toBe(403);
    expect(
      (await write('fleet', { action: 'withdraw', revision: other.revision, vehicleId: other.vehicles[0].id })).status,
    ).toBe(403);
  });
  it('re-verifies ownership before refreshing readings', async () => {
    const view = (await publish()).body.data;
    mocks.vehicles.mockResolvedValue({ status: 'ok', playerName: 'Self', vehicles: [] });
    const result = await write('fleet', {
      action: 'reverify',
      revision: view.revision,
      vehicleId: view.vehicles[0].id,
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('LOGISTICS_NOT_OWNER');
  });
});

describe('N070 Landsraad campaign API', () => {
  it('links targets only to objectives the server reports and lets members self-assign', async () => {
    landsraad = {
      term: { term_id: '42nd Landsraad' },
      tasks: [{ task_id: 7, name: 'Deliver water', completed: false }],
    };
    asLeader = true;
    const target = (taskKey: string | null) => ({
      id: randomUUID(),
      taskKey,
      title: 'Water drive',
      goal: '',
      priority: 'high',
      status: 'active',
      assigneeRefs: [memberRef('2', 'other-pawn')],
    });
    expect((await write('landsraad', { action: 'save', revision: null, target: target('99') })).body.code).toBe(
      'LOGISTICS_OBJECTIVE_UNVERIFIED',
    );
    const saved = await write('landsraad', { action: 'save', revision: null, target: target('7') });
    expect(saved.status).toBe(200);
    expect(saved.body.data.targets[0]).toMatchObject({
      termId: '42nd Landsraad',
      assignees: [{ name: 'Other', isSelf: false }],
    });
    asLeader = false;
    expect(
      (await write('landsraad', { action: 'save', revision: saved.body.data.revision, target: target(null) })).status,
    ).toBe(403);
    const claimed = await write('landsraad', {
      action: 'claim',
      revision: saved.body.data.revision,
      id: saved.body.data.targets[0].id,
    });
    expect(claimed.body.data.targets[0].assignees.map((entry: { name: string }) => entry.name)).toEqual([
      'Other',
      'Self',
    ]);
    expect(JSON.stringify(claimed.body)).not.toMatch(/self-pawn|other-pawn|memberId/);
  });
  it('keeps guild-defined targets working when objectives are unsupported', async () => {
    landsraad = { capabilities: { landsraad: false } };
    asLeader = true;
    const view = await read('section=landsraad');
    expect(view.body.data.observation).toEqual({ status: 'unsupported' });
    const saved = await write('landsraad', {
      action: 'save',
      revision: null,
      target: {
        id: randomUUID(),
        taskKey: null,
        title: 'Guild goal',
        goal: '',
        priority: 'normal',
        status: 'planned',
        assigneeRefs: [],
      },
    });
    expect(saved.status).toBe(200);
  });
});
