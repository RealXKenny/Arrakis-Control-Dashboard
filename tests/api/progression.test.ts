import { beforeEach, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  linked: vi.fn(),
  limit: vi.fn(),
  profile: vi.fn(),
  readPlanner: vi.fn(),
  readJournal: vi.fn(),
  mutate: vi.fn(),
  record: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/player/server/item-finder', () => ({ resolveItemCharacter: state.linked }));
vi.mock('../../src/features/portal/server/load', () => ({ loadPortalProfile: state.profile }));
vi.mock('../../src/features/progression/server/store', () => ({
  readPlanner: state.readPlanner,
  readJournal: state.readJournal,
  mutatePlanner: state.mutate,
  recordSnapshot: state.record,
  clearJournal: state.clear,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
import { GET, POST } from '../../src/app/api/v2/progression/route';
import { POST as JOURNAL } from '../../src/app/api/v2/progression/journal/route';
import { emptyJournal } from '../../src/features/progression/journal';
import { emptyPlanner } from '../../src/features/progression/model';

const revision = '07acb5b6-58f3-4c18-b4b7-dbe8ed748b21';
const session = { user: { id: 'verified-user' } };
const goal = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'level',
  title: 'Reach 50',
  ref: '',
  target: '50',
  balance: null,
  pinned: true,
  done: false,
  note: '',
};
const post = (route: (request: Request) => Promise<Response>, body: unknown, origin = 'http://localhost') =>
  route(
    new Request('http://localhost/api/v2/progression', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
const profile = {
  status: 'ok',
  capturedAt: '2026-11-20T10:00:00.000Z',
  profile: {
    legacyCharacter: { playerId: 101 },
    character: {},
    bases: [],
    vehicles: [],
    details: { progression: { level: 10 } },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue(session);
  state.linked.mockResolvedValue({ player: '101', controller: '202' });
  state.limit.mockResolvedValue({ allowed: true });
  state.readPlanner.mockResolvedValue({ ...emptyPlanner(), revision, tracking: { enabled: true, startedAt: null } });
  state.readJournal.mockResolvedValue(emptyJournal());
  state.mutate.mockResolvedValue({ ...emptyPlanner(), revision });
  state.record.mockResolvedValue({ journal: { ...emptyJournal(), revision }, recorded: true });
  state.clear.mockResolvedValue({ ...emptyJournal(), revision });
  state.profile.mockResolvedValue(profile);
});

it('rejects anonymous access before resolving a character', async () => {
  state.session.mockResolvedValue(null);
  expect((await GET(new Request('http://localhost/api/v2/progression'))).status).toBe(401);
  expect((await post(POST, { action: 'set-tracking', enabled: true, revision: null, character: '101' })).status).toBe(
    401,
  );
  expect(state.linked).not.toHaveBeenCalled();
  expect(state.readPlanner).not.toHaveBeenCalled();
});
it('keys records by the session owner and fresh link, ignoring caller IDs', async () => {
  const response = await GET(new Request('http://localhost/api/v2/progression?owner=foreign&character=999'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(state.readPlanner).toHaveBeenCalledWith('verified-user', '101');
  expect((await response.json()).character).toBe('101');
});
it('requires same-origin bounded strict JSON for changes', async () => {
  const body = { action: 'save-goal', item: goal, revision, character: '101' };
  expect((await post(POST, body, 'https://foreign.test')).status).toBe(403);
  expect((await post(POST, { ...body, owner: 'foreign' })).status).toBe(400);
  expect((await post(POST, { ...body, item: { ...goal, done: true } })).status).toBe(400);
  expect((await post(POST, 'x'.repeat(16385))).status).toBe(413);
  expect((await post(POST, '{bad')).status).toBe(400);
  expect(state.mutate).not.toHaveBeenCalled();
  expect((await post(POST, body)).status).toBe(200);
  expect(state.mutate).toHaveBeenCalledWith('verified-user', '101', body);
});
it('refuses a change prepared for another character', async () => {
  const response = await post(POST, { action: 'set-tracking', enabled: true, revision, character: '999' });
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe('CHARACTER_CHANGED');
  expect(state.mutate).not.toHaveBeenCalled();
});
it('fails closed when unlinked or throttled', async () => {
  state.linked.mockRejectedValue(new AppError('Link a character.', 403, 'UNLINKED', true));
  expect((await GET(new Request('http://localhost/api/v2/progression'))).status).toBe(403);
  state.limit.mockResolvedValue({ allowed: false });
  expect((await GET(new Request('http://localhost/api/v2/progression'))).status).toBe(429);
  state.limit.mockResolvedValue({ allowed: false, storageUnavailable: true });
  expect((await GET(new Request('http://localhost/api/v2/progression'))).status).toBe(503);
  expect(state.readPlanner).not.toHaveBeenCalled();
});
it('records observations only from the session profile while tracking is on', async () => {
  const response = await post(JOURNAL, { action: 'record', revision: null, character: '101' });
  expect(response.status).toBe(200);
  expect(state.record).toHaveBeenCalledWith(
    'verified-user',
    '101',
    null,
    expect.objectContaining({ at: '2026-11-20T10:00:00.000Z', level: '10' }),
    true,
  );
  expect((await post(JOURNAL, { action: 'auto', revision: null, character: '101' })).status).toBe(200);
  expect(state.record.mock.calls[1][4]).toBe(false);
});
it('never records when tracking is paused, readings fail or the profile belongs to another character', async () => {
  state.readPlanner.mockResolvedValue({ ...emptyPlanner(), revision });
  expect((await post(JOURNAL, { action: 'record', revision: null, character: '101' })).status).toBe(409);
  state.readPlanner.mockResolvedValue({ ...emptyPlanner(), revision, tracking: { enabled: true, startedAt: null } });
  state.profile.mockResolvedValue({ status: 'unavailable', message: 'down' });
  expect((await post(JOURNAL, { action: 'record', revision: null, character: '101' })).status).toBe(503);
  state.profile.mockResolvedValue({ ...profile, profile: { ...profile.profile, legacyCharacter: { playerId: 555 } } });
  expect((await post(JOURNAL, { action: 'record', revision: null, character: '101' })).status).toBe(409);
  expect(state.record).not.toHaveBeenCalled();
});
it('clears the journal with a revision fence', async () => {
  expect((await post(JOURNAL, { action: 'clear', revision, character: '101' })).status).toBe(200);
  expect(state.clear).toHaveBeenCalledWith('verified-user', '101', revision);
  expect(state.profile).not.toHaveBeenCalled();
});
