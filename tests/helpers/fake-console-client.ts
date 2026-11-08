import { FAKE_CONSOLE_PORT } from './fake-console.mjs';

const base = `http://127.0.0.1:${FAKE_CONSOLE_PORT}/__fixture`;
/** Sessions the browser Redis fixture recognises: browser-user-1 … browser-user-5000 (see browser-server.mjs). */
export const SESSION_POOL_SIZE = 5000;

async function call(path: string, body?: unknown) {
  const response = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error(`Fixture call ${path} failed`);
  return response.json();
}

const used = new Set<number>();
export const discordIdFor = (slot: number) => `90000000000${String(slot).padStart(7, '0')}`;

export type TestMember = {
  slot: number;
  discordId: string;
  /** Value for the `Cookie` header that signs this member in. */
  cookie: string;
  characterName: string;
};

/** Test-side control of the fake Console that the server renders from. */
export const fakeConsole = {
  /**
   * A brand-new signed-in member with a private character, so the test cannot collide with another one or with the
   * server's per-member caches. `patch` reshapes the character (`linked`, `details`, `failures`, `guild`).
   */
  async newMember(name = 'Desert Navigator', patch: Record<string, unknown> = {}): Promise<TestMember> {
    let slot: number;
    do slot = 1 + Math.floor(Math.random() * SESSION_POOL_SIZE);
    while (used.has(slot));
    used.add(slot);
    const discordId = discordIdFor(slot);
    await call('user', { discordId, name, patch });
    return { slot, discordId, cookie: `__Host-dashboard_session=browser-user-${slot}`, characterName: name };
  },
  /** Shape the world every member shares (market, guild list, failures). Call `reset` afterwards. */
  setShared: (patch: Record<string, unknown>) => call('shared', patch),
  reset: () => call('reset'),
  async requests(): Promise<Array<{ method: string; path: string; authorized: boolean; body?: string }>> {
    return (await fetch(`${base}/requests`)).json();
  },
};
