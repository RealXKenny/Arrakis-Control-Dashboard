import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { emptyPlan } from '../../src/features/expeditions/model';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  linked: vi.fn(),
  readPlan: vi.fn(),
  savePlan: vi.fn(),
  own: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
  shared: vi.fn(),
  fleet: vi.fn(),
  cargo: vi.fn(),
  limit: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/player/server/item-finder', () => ({ resolveItemCharacter: state.linked }));
vi.mock('../../src/features/expeditions/server/plan-store', () => ({
  readPlan: state.readPlan,
  savePlan: state.savePlan,
}));
vi.mock('../../src/features/expeditions/server/rescue-store', () => ({
  readOwnRescue: state.own,
  publishRescue: state.publish,
  cancelRescue: state.cancel,
  readSharedRescue: state.shared,
}));
vi.mock('../../src/features/vehicles/server/fleet', () => ({ readFleet: state.fleet, readCargo: state.cargo }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: state.audit }));
import { GET as getPlan, POST as postPlan } from '../../src/app/api/v2/expeditions/plan/route';
import { GET as getRescue, POST as postRescue } from '../../src/app/api/v2/expeditions/rescue/route';
import { GET as getShared } from '../../src/app/api/v2/expeditions/rescue/[id]/route';
import { GET as getFleet } from '../../src/app/api/v2/vehicles/fleet/route';
import { GET as getCargo } from '../../src/app/api/v2/vehicles/cargo/route';

const revision = '07acb5b6-58f3-4c18-b4b7-dbe8ed748b21';
const tag = 'a'.repeat(64);
const shareId = 'A'.repeat(43);
const rescue = {
  callSign: 'Paul',
  map: 'DeepDesert',
  x: null,
  y: null,
  place: 'Near the wreck',
  assistance: ['fuel'],
  details: '',
};
const post = (url: string, body: unknown, origin = 'http://localhost') =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'verified-user' } });
  state.linked.mockResolvedValue({ player: '101', controller: '202' });
  state.limit.mockResolvedValue({ allowed: true });
  state.readPlan.mockResolvedValue({ schemaVersion: 1, revision: null, plan: emptyPlan() });
  state.savePlan.mockResolvedValue({ schemaVersion: 1, revision, plan: emptyPlan() });
  state.own.mockResolvedValue({ active: null });
  state.publish.mockResolvedValue({ active: null });
  state.cancel.mockResolvedValue({ active: null });
  state.fleet.mockResolvedValue({ vehicles: [], excluded: 0, limited: false, observedAt: '' });
});

describe('expedition plan API', () => {
  it('rejects anonymous access before resolving characters', async () => {
    state.session.mockResolvedValue(null);
    expect((await getPlan(new Request('http://localhost/api/v2/expeditions/plan'))).status).toBe(401);
    expect((await getFleet(new Request('http://localhost/api/v2/vehicles/fleet'))).status).toBe(401);
    expect((await getRescue(new Request('http://localhost/api/v2/expeditions/rescue'))).status).toBe(401);
    expect(state.linked).not.toHaveBeenCalled();
    expect(state.fleet).not.toHaveBeenCalled();
  });

  it('derives ownership from the session and fresh link, ignoring caller IDs, with no-store responses', async () => {
    const response = await getPlan(new Request('http://localhost/api/v2/expeditions/plan?userId=foreign'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(state.readPlan).toHaveBeenCalledWith('verified-user', '202', '101');
  });

  it('requires same-origin bounded strict JSON and saves with compare-and-set', async () => {
    expect(
      (await postPlan(post('/api/v2/expeditions/plan', { revision, plan: emptyPlan() }, 'https://evil.test'))).status,
    ).toBe(403);
    expect(
      (await postPlan(post('/api/v2/expeditions/plan', { revision, plan: emptyPlan(), ownerId: 'x' }))).status,
    ).toBe(400);
    expect((await postPlan(post('/api/v2/expeditions/plan', 'not json'))).status).toBe(400);
    expect((await postPlan(post('/api/v2/expeditions/plan', 'x'.repeat(128 * 1024 + 1)))).status).toBe(413);
    expect(state.savePlan).not.toHaveBeenCalled();
    expect((await postPlan(post('/api/v2/expeditions/plan', { revision, plan: emptyPlan() }))).status).toBe(200);
    expect(state.savePlan).toHaveBeenCalledWith('verified-user', '202', '101', revision, emptyPlan());
    state.savePlan.mockRejectedValue(new AppError('changed', 409, 'PLAN_CONFLICT', true));
    expect((await postPlan(post('/api/v2/expeditions/plan', { revision, plan: emptyPlan() }))).status).toBe(409);
    expect(state.savePlan).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the member limit is exhausted', async () => {
    state.limit.mockResolvedValue({ allowed: false });
    expect((await getPlan(new Request('http://localhost/api/v2/expeditions/plan'))).status).toBe(429);
    expect((await getFleet(new Request('http://localhost/api/v2/vehicles/fleet'))).status).toBe(429);
    expect(state.readPlan).not.toHaveBeenCalled();
    expect(state.fleet).not.toHaveBeenCalled();
  });
});

describe('fleet API', () => {
  it('validates the cargo vehicle ID before any provider read', async () => {
    expect((await getCargo(new Request('http://localhost/api/v2/vehicles/cargo?vehicle=../x'))).status).toBe(400);
    expect(state.cargo).not.toHaveBeenCalled();
    state.cargo.mockResolvedValue({ vehicleId: '22', totals: [] });
    expect((await getCargo(new Request('http://localhost/api/v2/vehicles/cargo?vehicle=22'))).status).toBe(200);
    expect(state.cargo).toHaveBeenCalledWith({ user: { id: 'verified-user' } }, '22', expect.anything());
  });
});

describe('rescue request API', () => {
  it('publishes only an explicitly confirmed, strict card for the session owner', async () => {
    const body = { action: 'publish', data: rescue, hours: 2, confirmed: true, expected: null };
    expect((await postRescue(post('/api/v2/expeditions/rescue', { ...body, confirmed: false }))).status).toBe(400);
    expect((await postRescue(post('/api/v2/expeditions/rescue', { ...body, hours: 24 }))).status).toBe(400);
    expect(
      (await postRescue(post('/api/v2/expeditions/rescue', { ...body, data: { ...rescue, assistance: [] } }))).status,
    ).toBe(400);
    expect((await postRescue(post('/api/v2/expeditions/rescue', { ...body, ownerId: 'x' }))).status).toBe(400);
    expect((await postRescue(post('/api/v2/expeditions/rescue', body, 'https://evil.test'))).status).toBe(403);
    expect(state.publish).not.toHaveBeenCalled();
    expect((await postRescue(post('/api/v2/expeditions/rescue', body))).status).toBe(200);
    expect(state.publish).toHaveBeenCalledWith('verified-user', null, rescue, 2);
    expect(state.audit).toHaveBeenCalledWith({ event: 'rescue.publish', outcome: 'success', actor: 'verified-user' });
    expect((await postRescue(post('/api/v2/expeditions/rescue', { action: 'cancel', expected: tag }))).status).toBe(
      200,
    );
    expect(state.cancel).toHaveBeenCalledWith('verified-user', tag);
  });

  it('shows shared cards only to signed-in members and hides ended links', async () => {
    const context = { params: Promise.resolve({ id: shareId }) };
    state.shared.mockResolvedValue(null);
    expect((await getShared(new Request('http://localhost'), context)).status).toBe(404);
    state.shared.mockResolvedValue({ data: rescue, publishedAt: '', expiresAt: '' });
    const ok = await getShared(new Request('http://localhost'), { params: Promise.resolve({ id: shareId }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ card: { data: rescue, publishedAt: '', expiresAt: '' } });
    state.shared.mockClear();
    expect(
      (await getShared(new Request('http://localhost'), { params: Promise.resolve({ id: 'short' }) })).status,
    ).toBe(404);
    expect(state.shared).not.toHaveBeenCalled();
    state.session.mockResolvedValue(null);
    expect(
      (await getShared(new Request('http://localhost'), { params: Promise.resolve({ id: shareId }) })).status,
    ).toBe(401);
  });
});
