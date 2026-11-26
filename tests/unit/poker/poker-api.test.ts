import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '100000000000000001';
const GUILD_ID = '200000000000000002';
const ROLE_ID = '300000000000000003';
const ALICE = '400000000000000004';
const BOB = '500000000000000005';
const ORIGIN = `https://${CLIENT_ID}.discordsays.com`;

const state = vi.hoisted(() => ({
  enabled: true,
  store: new Map<string, string>(),
  limited: false,
  limitedKey: null as string | null,
  limitKeys: [] as Array<{ key: string; limit: number }>,
  audits: [] as unknown[],
  saves: 0,
  conflictNextSave: false,
}));

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/features/auth/server/session', () => ({ currentSession: async () => null }));
vi.mock('../../../src/config/env', () => ({
  getServerEnv: () => ({
    NODE_ENV: 'test',
    LOG_LEVEL: 'ERROR',
    POKER_ACTIVITY_ENABLED: state.enabled,
    DISCORD_CLIENT_ID: CLIENT_ID,
    DISCORD_CLIENT_SECRET: 'synthetic-secret',
    DISCORD_GUILD_ID: GUILD_ID,
    DISCORD_BOT_TOKEN: 'synthetic.bot.token-value',
    VERIFIED_MEMBER_ROLE_ID: ROLE_ID,
    APP_URL: 'https://dashboard.example.test',
  }),
}));
vi.mock('../../../src/lib/security/audit', () => ({
  recordAudit: async (event: unknown) => {
    state.audits.push(event);
  },
}));
vi.mock('../../../src/lib/security/rate-limit', () => ({
  getClientAddress: () => '198.51.100.7',
  checkRateLimit: async (key: string, rule: { limit: number }) => {
    state.limitKeys.push({ key, limit: rule.limit });
    const blocked = state.limited || (state.limitedKey !== null && key.startsWith(state.limitedKey));
    return { allowed: !blocked, remaining: 1, retryAfter: 1 };
  },
}));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    async get(key: string) {
      const value = state.store.get(key);
      return value === undefined ? null : JSON.parse(value);
    },
    async set(key: string, value: unknown) {
      state.store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      return 'OK';
    },
    // Emulates the two poker Lua scripts by their header line.
    async eval(script: string, keys: string[], args: Array<string | number>) {
      const key = keys[0] as string;
      if (script.includes('poker-table-read-v1')) return state.store.get(key) ?? '';
      if (script.includes('poker-table-save-v1')) {
        if (state.conflictNextSave) {
          state.conflictNextSave = false;
          return 'conflict';
        }
        const old = state.store.get(key);
        const expected = String(args[0]);
        if (old ? JSON.parse(old).revision !== expected : expected !== '') return 'conflict';
        state.store.set(key, String(args[1]));
        state.saves += 1;
        return 'ok';
      }
      throw new Error('unexpected script');
    },
  }),
}));

type Member = { id: string; roles: string[]; nick?: string };
let members: Record<string, Member> = {};
let instanceUsers: string[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.useRealTimers();
  state.enabled = true;
  state.store.clear();
  state.limited = false;
  state.limitedKey = null;
  state.limitKeys = [];
  state.audits = [];
  state.saves = 0;
  state.conflictNextSave = false;
  members = {
    'code-alice': { id: ALICE, roles: [ROLE_ID], nick: 'Alice' },
    'code-bob': { id: BOB, roles: [ROLE_ID], nick: 'Bob' },
    'code-norole': { id: '600000000000000006', roles: [] },
  };
  instanceUsers = [ALICE, BOB, '600000000000000006'];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      if (url === 'https://discord.com/api/oauth2/token') {
        const code = new URLSearchParams(String(init?.body)).get('code') ?? '';
        if (new URLSearchParams(String(init?.body)).has('redirect_uri')) return jsonResponse({}, 400);
        return members[code]
          ? jsonResponse({ access_token: `token-${code}` })
          : jsonResponse({ error: 'invalid_grant' }, 400);
      }
      const member = Object.entries(members).find(([code]) => auth === `Bearer token-${code}`)?.[1];
      if (url === 'https://discord.com/api/users/@me' && member)
        return jsonResponse({ id: member.id, username: 'user' });
      if (url === `https://discord.com/api/users/@me/guilds/${GUILD_ID}/member` && member)
        return jsonResponse({ roles: member.roles, nick: member.nick });
      if (url.startsWith(`https://discord.com/api/v10/applications/${CLIENT_ID}/activity-instances/`)) {
        expect(auth).toBe('Bot synthetic.bot.token-value');
        const id = decodeURIComponent(url.split('/').pop() ?? '');
        if (id !== 'i-live') return jsonResponse({ message: 'Unknown' }, 404);
        return jsonResponse({ instance_id: 'i-live', location: { guild_id: GUILD_ID }, users: instanceUsers });
      }
      return jsonResponse({}, 404);
    }),
  );
});

async function handlers() {
  return import('../../../src/features/poker/server/handlers');
}
async function routed(handler: (request: Request) => Promise<Response>, request: Request) {
  const { route } = await import('../../../src/server/http');
  return route(handler)(request);
}

function sessionRequest(code: string, instanceId = 'i-live', origin = ORIGIN) {
  return new Request('https://dashboard.example.test/api/v2/poker/session', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ code, instanceId }),
  });
}

async function signIn(code: string): Promise<string> {
  const { createSession } = await handlers();
  const response = await routed(createSession, sessionRequest(code));
  const body = (await response.json()) as { token: string };
  expect(response.status).toBe(200);
  return body.token;
}

function tableRequest(token: string, body?: unknown) {
  return new Request('https://dashboard.example.test/api/v2/poker/table', {
    method: body ? 'POST' : 'GET',
    headers: { origin: ORIGIN, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function act(token: string, body: unknown) {
  const { postTableAction } = await handlers();
  const response = await routed(postTableAction, tableRequest(token, body));
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

describe('poker Activity session', () => {
  it('issues an opaque bearer token and never returns or stores the Discord access token', async () => {
    const { createSession } = await handlers();
    const response = await routed(createSession, sessionRequest('code-alice'));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(text).not.toContain('token-code-alice');
    const body = JSON.parse(text);
    expect(body.player).toEqual({ id: ALICE, displayName: 'Alice' });
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...state.store.keys()].some((key) => key.includes(body.token))).toBe(false);
    expect([...state.store.values()].join()).not.toContain('token-code-alice');
  });

  it('is hidden while the feature flag is off', async () => {
    state.enabled = false;
    const { createSession } = await handlers();
    expect((await routed(createSession, sessionRequest('code-alice'))).status).toBe(404);
  });

  it('rejects other origins, missing roles, unknown instances and players outside the instance', async () => {
    const { createSession } = await handlers();
    expect((await routed(createSession, sessionRequest('code-alice', 'i-live', 'https://evil.example'))).status).toBe(
      403,
    );
    expect(state.audits).toHaveLength(1);
    expect((await routed(createSession, sessionRequest('code-norole'))).status).toBe(403);
    expect((await routed(createSession, sessionRequest('code-alice', 'i-gone'))).status).toBe(404);
    instanceUsers = [BOB];
    expect((await routed(createSession, sessionRequest('code-alice'))).status).toBe(403);
    expect((await routed(createSession, sessionRequest('bad code!'))).status).toBe(400);
    expect((await routed(createSession, sessionRequest('code-unknown'))).status).toBe(401);
  });

  it('rate limits sign-in attempts', async () => {
    state.limited = true;
    const { createSession } = await handlers();
    expect((await routed(createSession, sessionRequest('code-alice'))).status).toBe(429);
  });

  it('keeps a generous shared-address ceiling and a tighter per-instance budget', async () => {
    const { createSession } = await handlers();
    expect((await routed(createSession, sessionRequest('code-alice'))).status).toBe(200);
    expect(state.limitKeys).toContainEqual({ key: 'poker:session:198.51.100.7', limit: 60 });
    expect(state.limitKeys).toContainEqual({ key: 'poker:session-instance:i-live', limit: 12 });
    state.limitedKey = 'poker:session-instance:';
    expect((await routed(createSession, sessionRequest('code-alice'))).status).toBe(429);
  });
});

describe('poker table API', () => {
  it('requires an Activity session', async () => {
    const { getTable } = await handlers();
    const response = await routed(getTable, tableRequest('x'.repeat(43)));
    expect(response.status).toBe(401);
  });

  it('shows an empty table without creating a record', async () => {
    const token = await signIn('code-alice');
    const { getTable } = await handlers();
    const body = (await (await routed(getTable, tableRequest(token))).json()) as Record<string, any>;
    expect(body.seated).toBe(false);
    expect(body.table.seats).toEqual([]);
    expect(state.saves).toBe(0);
  });

  it('plays a hand while keeping each player’s cards private', async () => {
    const alice = await signIn('code-alice');
    const bob = await signIn('code-bob');
    expect((await act(alice, { action: 'join' })).body.seated).toBe(true);
    await act(bob, { action: 'join' });
    const dealt = await act(alice, { action: 'deal' });
    expect(dealt.status).toBe(200);
    expect(dealt.body.turnDeadline).toBeGreaterThan(Date.now());
    const aliceSeat = dealt.body.table.seats.find((seat: { playerId: string }) => seat.playerId === ALICE);
    const bobSeat = dealt.body.table.seats.find((seat: { playerId: string }) => seat.playerId === BOB);
    expect(aliceSeat.hole.every((card: unknown) => card !== null)).toBe(true);
    expect(bobSeat.hole).toEqual([null, null]);
    expect(JSON.stringify(dealt.body)).not.toContain('deck');

    expect((await act(bob, { action: 'check' })).status).toBe(409);
    expect((await act(alice, { action: 'raise', amount: 15 })).body.error).toContain('minimum');
    expect((await act(alice, { action: 'call' })).status).toBe(200);
    const flop = await act(bob, { action: 'check' });
    expect(flop.body.table.street).toBe('flop');
    expect(flop.body.table.board).toHaveLength(3);
  });

  it('rejects malformed actions and dealing from outside the table', async () => {
    const alice = await signIn('code-alice');
    expect((await act(alice, { action: 'raise', amount: 1.5 })).status).toBe(400);
    expect((await act(alice, { action: 'join', seat: 3 })).status).toBe(400);
    expect((await act(alice, { action: 'deal' })).status).toBe(409);
  });

  it('retries a lost compare-and-set race instead of failing the player', async () => {
    const alice = await signIn('code-alice');
    state.conflictNextSave = true;
    const joined = await act(alice, { action: 'join' });
    expect(joined.status).toBe(200);
    expect(state.saves).toBe(1);
  });

  it('auto-plays an expired turn on the next read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
    const alice = await signIn('code-alice');
    const bob = await signIn('code-bob');
    await act(alice, { action: 'join' });
    await act(bob, { action: 'join' });
    await act(alice, { action: 'deal' });
    vi.setSystemTime(new Date('2026-12-01T12:00:31Z'));
    const { getTable } = await handlers();
    const body = (await (await routed(getTable, tableRequest(bob))).json()) as Record<string, any>;
    // Alice, the small blind, faced the big blind and was folded by the clock.
    expect(body.table.street).toBe('showdown');
    expect(body.table.result.pots[0].winners).toEqual([BOB]);
  });

  it('lets a lone player add an AI opponent that plays its own turns', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
    const alice = await signIn('code-alice');
    expect((await act(alice, { action: 'add-bot' })).status).toBe(409);
    await act(alice, { action: 'join' });
    const added = await act(alice, { action: 'add-bot' });
    expect(added.body.table.seats.map((seat: { isBot: boolean }) => seat.isBot)).toEqual([false, true]);
    // Heads-up: Alice is on the button and acts first; after her call the AI is to act.
    await act(alice, { action: 'deal' });
    const called = await act(alice, { action: 'call' });
    expect(called.body.table.seats[called.body.table.turn].isBot).toBe(true);
    expect(called.body.table.seats[1].hole).toEqual([null, null]);
    vi.setSystemTime(new Date('2026-12-01T12:00:10Z'));
    const { getTable } = await handlers();
    const after = (await (await routed(getTable, tableRequest(alice))).json()) as Record<string, any>;
    // The AI has played every turn that came due (check, call, raise or fold are all legal for it),
    // so the table changed and the action is back with Alice or the hand is over.
    expect(after.revision).not.toBe(called.body.revision);
    expect(after.table.seats[after.table.turn]?.isBot ?? false).toBe(false);
  });

  it('caps a lobby at four, removes AI on request and clears AI when the last person leaves', async () => {
    const alice = await signIn('code-alice');
    await act(alice, { action: 'join' });
    for (let i = 0; i < 3; i += 1) expect((await act(alice, { action: 'add-bot' })).status).toBe(200);
    expect((await act(alice, { action: 'add-bot' })).body.error).toBe('The table is full.');
    const bob = await signIn('code-bob');
    const joined = await act(bob, { action: 'join' });
    expect(joined.body.table.seats).toHaveLength(4);
    expect((await act(alice, { action: 'remove-bot', playerId: ALICE })).status).toBe(400);
    expect((await act(alice, { action: 'remove-bot', playerId: 'ai-1' })).body.table.seats).toHaveLength(3);
    await act(bob, { action: 'leave' });
    const empty = await act(alice, { action: 'leave' });
    expect(empty.body.table.seats).toEqual([]);
  });
});
