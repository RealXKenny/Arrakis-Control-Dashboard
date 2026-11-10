import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { casinoReply } from './casino-redis.mjs';
import { eventsReply } from './events-redis.mjs';
import { noticeboardReply } from './guild-noticeboard-redis.mjs';
import { operationsReply } from './guild-operations-redis.mjs';
import { resourcesReply } from './guild-resources-redis.mjs';
import { createRedisFixture } from './redis-resp.mjs';
import { startFakeConsole } from './fake-console.mjs';

// Isolated browser fixture only; never used by the production runtime.
const sessionKey = (id) => `arrakis:session:${createHash('sha256').update(id).digest('hex')}`;
// Per-test members: browser-user-1 … browser-user-5000, each with its own Discord ID (see fake-console-client.ts).
const poolSlots = new Map();
for (let slot = 1; slot <= 5000; slot++) poolSlots.set(sessionKey(`browser-user-${slot}`), slot);
const poolDiscordId = (slot) => `90000000000${String(slot).padStart(7, '0')}`;
// One published recruitment listing. Its stored name is deliberately wrong: the dashboard must show the Console's name.
const listing = {
  guildName: 'Impostor Guild Name',
  requirements: 'Be active in the Deep Desert.',
  contact: 'Discord: crimson#0001',
  published: true,
  applicationQuestions: [
    { id: '7b1f5a56-8c9d-4a4e-9b0d-1f3a2c4d5e6f', label: 'Why do you want to join?', required: true },
  ],
};
const storage = createRedisFixture(([operation, key, ...args]) => {
  const resources = resourcesReply(operation, key, args);
  if (resources !== undefined) return resources.value;
  const operations = operationsReply(operation, key, args);
  if (operations !== undefined) return operations.value;
  const noticeboard = noticeboardReply(operation, key, args);
  if (noticeboard !== undefined) return noticeboard.value;
  const events = eventsReply(operation, key, args);
  if (events !== undefined) return events.value;
  const casino = casinoReply(operation, key, args);
  if (casino !== undefined) return casino.value;
  if (operation.toUpperCase() === 'ZRANGE' && key === 'arrakis:{guilds}:requirements-index') return ['guild:2'];
  if (operation.toUpperCase() === 'GET' && key === 'arrakis:{guilds}:requirements:2') return JSON.stringify(listing);
  if (operation.toUpperCase() === 'EVAL') {
    if (args.includes('arrakis:{avatars}:v1:images'))
      return key.includes("redis.call('HGET'")
        ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='
        : 1;
    return [1, 60000];
  }
  if (operation.toUpperCase() === 'GET') {
    const admin = key === sessionKey('browser-admin-session');
    const member = key === sessionKey('browser-member-session');
    const slot = poolSlots.get(key);
    return admin || member || slot
      ? JSON.stringify({
          user: {
            id: admin ? '456084885220884480' : slot ? poolDiscordId(slot) : '123456789000000000',
            username: admin ? 'Test administrator' : slot ? `Pool member ${slot}` : 'Test member',
            ...(member ? { avatar: '0123456789abcdef0123456789abcdef' } : {}),
            ...(member ? { guild_nickname: 'Server Alias' } : {}),
          },
          guildId: 'browser-test-guild',
          roleIds: ['browser-test-role'],
          authenticatedAt: Date.now(),
          expiresAt: Date.now() + 3600000,
          verifiedAt: Date.now(),
        })
      : null;
  }
  return 'OK';
});
storage.server.listen(0, '127.0.0.1');
await once(storage.server, 'listening');
// The server renders from this fake Console and adapter; tests shape it through /__fixture/* (fake-console-client.ts).
const fakeConsole = startFakeConsole();
await fakeConsole.listen();
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3100'],
  {
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      DISCORD_BOT_TOKEN: '',
      CHANGELOG_CHANNEL_ID: '',
      COMMUNITY_EVENTS_CHANNEL_ID: '',
      REDIS_URL: `redis://127.0.0.1:${storage.server.address().port}/0`,
      CONSOLE_URL: fakeConsole.url,
      REDIS_CLUSTER_NODES: '',
      RABBITMQ_CA_FILE: '',
      RABBITMQ_TLS_CA: '',
      RABBITMQ_TLS_CERT: '',
      RABBITMQ_TLS_KEY: '',
      RABBITMQ_TLS_CA_PATH: '',
      RABBITMQ_TLS_CERT_PATH: '',
      RABBITMQ_TLS_KEY_PATH: '',
      RABBITMQ_TLS_ENABLED: 'true',
      RABBITMQ_TLS_REJECT_UNAUTHORIZED: 'true',
      RABBITMQ_TLS_SERVERNAME: '',
    },
  },
);
const stop = () => child.kill();
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
child.once('error', async () => {
  process.exitCode = 1;
  await storage.close();
  await fakeConsole.close();
});
child.once('exit', async (code) => {
  process.exitCode = code ?? 1;
  await storage.close();
  await fakeConsole.close();
});
