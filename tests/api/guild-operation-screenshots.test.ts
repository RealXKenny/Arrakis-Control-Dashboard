import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredOperation } from '../../src/features/guilds/operations';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  linked: vi.fn(),
  request: vi.fn(),
  read: vi.fn(),
  add: vi.fn(),
  image: vi.fn(),
  process: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../src/features/guilds/server/operations-store', () => ({
  readGuildOperations: mocks.read,
  readSettledOperations: mocks.read,
  mutateGuildOperation: vi.fn(),
  addOperationScreenshot: mocks.add,
  readOperationScreenshot: mocks.image,
}));
vi.mock('../../src/features/events/server/submission-image', () => ({ processSubmissionImage: mocks.process }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: async () => ({ allowed: true }) }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://dashboard.test', NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }),
}));
import { POST } from '../../src/app/api/v2/guilds/[guildId]/operations/[operationId]/screenshots/route';
import { GET } from '../../src/app/api/v2/guilds/[guildId]/operations/[operationId]/screenshots/[screenshotId]/route';

const shot = randomUUID();
const operation: StoredOperation = {
  id: randomUUID(),
  revision: randomUUID(),
  title: 'Spice run',
  kind: 'spice-run',
  details: '',
  meetingPoint: 'Base',
  startsAt: '2026-01-02T12:00:00.000Z',
  endsAt: '2026-01-02T14:00:00.000Z',
  roles: [{ role: 'pilot', capacity: 1 }],
  status: 'completed',
  organizerName: 'Leader',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  signups: [],
  screenshots: [
    { id: shot, caption: '', uploadedBy: 'Pilot', uploaderId: 'pawn', uploadedAt: '2026-01-02T15:00:00.000Z' },
  ],
};
const params = (screenshotId?: string, operationId = operation.id) => ({
  params: Promise.resolve({ guildId: '2', operationId, ...(screenshotId ? { screenshotId } : {}) }),
});
const image = (screenshotId: string = shot, operationId: string = operation.id) =>
  GET(new Request('https://dashboard.test/x'), params(screenshotId, operationId) as never);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'discord', username: 'Pilot' }, guildId: 'g', roleIds: [] });
  mocks.linked.mockResolvedValue({ linked: true, pawnId: 'pawn' });
  mocks.request.mockResolvedValue({ rows: [{ player_id: 'pawn', role_id: 1, character_name: 'Pilot' }] });
  mocks.read.mockResolvedValue([operation]);
  mocks.image.mockResolvedValue(Buffer.from('RIFF0000WEBP'));
});

describe('after-action screenshot routes', () => {
  it('serves only listed screenshots to current members with a locked-down response', async () => {
    const response = await image();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect((await image(randomUUID())).status).toBe(404);
    expect((await image('not-a-uuid')).status).toBe(404);
    mocks.request.mockResolvedValue({ rows: [{ player_id: 'someone', role_id: 1 }] });
    expect((await image()).status).toBe(403);
    mocks.session.mockResolvedValue(null);
    expect((await image()).status).toBe(401);
  });
  it('accepts multipart uploads from the same origin and re-encodes them before storage', async () => {
    const form = new FormData();
    form.set('revision', operation.revision);
    form.set('caption', 'Haul');
    form.set('image', new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' }));
    mocks.process.mockResolvedValue({ bytes: Buffer.from('webp'), version: randomUUID() });
    mocks.add.mockResolvedValue(operation);
    const request = (body: BodyInit, origin = 'https://dashboard.test') =>
      POST(new Request('https://dashboard.test/x', { method: 'POST', headers: { origin }, body }), params() as never);
    expect((await request(form, 'https://evil.test')).status).toBe(403);
    expect((await request(JSON.stringify({}))).status).toBe(415);
    const response = await request(form);
    expect(response.status).toBe(201);
    expect(mocks.process).toHaveBeenCalledOnce();
    expect(mocks.add).toHaveBeenCalledWith(
      '2',
      operation.id,
      operation.revision,
      expect.objectContaining({ caption: 'Haul', bytes: Buffer.from('webp') }),
      expect.objectContaining({ memberId: 'pawn', canEdit: false }),
    );
    expect(JSON.stringify(await response.json())).not.toContain('uploaderId');
  });
});
