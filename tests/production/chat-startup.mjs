import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createRedisFixture } from '../helpers/redis-resp.mjs';

async function unusedPort() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  return port;
}
const redis = createRedisFixture(([operation]) => {
  if (operation === 'PING') return 'PONG';
  if (operation === 'INFO') return 'redis_version:7.4.0\r\nloading:0\r\n';
  return null;
});
redis.server.listen(0, '127.0.0.1');
await once(redis.server, 'listening');
const port = await unusedPort();
const healthPort = await unusedPort();
const children = new Set();
// This wrapper translates a test-only IPC stop into the launcher's real signal path. Recording
// direct child IDs also guarantees cleanup on Windows if a failed test cannot finish shutdown.
const wrapper = `
  import cp from 'node:child_process';
  import {syncBuiltinESMExports} from 'node:module';
  const original = cp.spawn;
  cp.spawn = (...args) => { const child = original(...args); if(child.pid) process.send({pid:child.pid}); return child; };
  syncBuiltinESMExports();
  process.on('message', () => process.emit('SIGTERM'));
  const {runServer} = await import('./scripts/server-launcher.mjs');
  await runServer(['start', '--hostname', '127.0.0.1', '--port', '${port}']);
  process.disconnect();
`;
const child = spawn(process.execPath, ['--input-type=module', '-e', wrapper], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: {
    ...process.env,
    NODE_ENV: 'production',
    LOG_LEVEL: 'FATAL',
    DOTENV_CONFIG_QUIET: 'true',
    CHAT_ENABLED: 'true',
    CHAT_SERVERS: '[{"id":"fixture","label":"Fixture","map":"HaggaBasin.0"}]',
    CHAT_BRIDGE_FUNCOM_ID: 'Fixture#0001',
    CHAT_BRIDGE_DISPLAY_NAME: '',
    CHAT_BRIDGE_HEALTH_HOST: '127.0.0.1',
    CHAT_BRIDGE_HEALTH_PORT: String(healthPort),
    RABBITMQ_URL: 'amqp://5E121CE000000001:fixture-only@127.0.0.1:9/',
    RABBITMQ_CA_FILE: '',
    RABBITMQ_TLS_SERVERNAME: '',
    RABBITMQ_TLS_ENABLED: 'false',
    RABBITMQ_TLS_CA: '',
    RABBITMQ_TLS_CERT: '',
    RABBITMQ_TLS_KEY: '',
    RABBITMQ_TLS_CA_PATH: '',
    RABBITMQ_TLS_CERT_PATH: '',
    RABBITMQ_TLS_KEY_PATH: '',
    RABBITMQ_TLS_REJECT_UNAUTHORIZED: 'true',
    REDIS_URL: `redis://127.0.0.1:${redis.server.address().port}/15`,
    REDIS_CLUSTER_NODES: '',
    CONSOLE_URL: 'http://127.0.0.1:9',
    CONSOLE_API_KEY: 'fixture-only',
    ADAPTER_TOKEN: 'fixture-only',
    DISCORD_CLIENT_ID: 'fixture',
    DISCORD_CLIENT_SECRET: 'fixture',
    DISCORD_GUILD_ID: 'fixture',
    VERIFIED_MEMBER_ROLE_ID: 'fixture',
    ADMIN_DISCORD_IDS: '456084885220884480',
    APP_URL: `http://127.0.0.1:${port}`,
    AUTH_SECRET: 'fixture-only-authentication-secret-32',
    CHANGELOG_AUTO_ANNOUNCE: 'false',
    DISCORD_BOT_TOKEN: '',
    CHANGELOG_CHANNEL_ID: '',
    COMMUNITY_EVENTS_CHANNEL_ID: '',
  },
});
child.on('message', (message) => {
  if (Number.isSafeInteger(message?.pid)) children.add(message.pid);
});
// Consume output without printing configuration or messages if startup fails.
child.stdout.resume();
child.stderr.resume();
let exited = false;
const done = new Promise((resolve) =>
  child.once('exit', () => {
    exited = true;
    resolve();
  }),
);
async function reachable(url) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(5_000) });
  } catch {
    return null;
  }
}
async function waitFor(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !exited) {
    const response = await reachable(url);
    if (response?.ok) return response;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Automatic chat launcher fixture did not become ready.');
}
let timer;
try {
  // No dashboard request has occurred: the consumer child must already be running.
  assert.equal((await waitFor(`http://127.0.0.1:${healthPort}/health`)).status, 200);
  const ready = await reachable(`http://127.0.0.1:${healthPort}/ready`);
  assert.equal(ready.status, 503);
  assert.deepEqual(await ready.json(), { ready: false, rabbitmq: false, redis: true });
  // The sign-in page verifies Next readiness without cold Console-dependent landing-page reads.
  assert.equal((await waitFor(`http://127.0.0.1:${port}/login`)).status, 200);
  assert.equal(children.size, 2);
  child.send('stop');
  await Promise.race([
    done,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Chat launcher fixture shutdown timed out.')), 20_000);
    }),
  ]);
  assert.equal(await reachable(`http://127.0.0.1:${healthPort}/health`), null);
  assert.equal(await reachable(`http://127.0.0.1:${port}/`), null);
  console.log(
    'Chat startup smoke passed: automatic worker before page requests, two children, honest readiness, shared shutdown. Local fixtures only.',
  );
} finally {
  clearTimeout(timer);
  // Only PIDs emitted by this test's own spawn wrapper are eligible for fallback cleanup.
  for (const pid of children) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
  if (!exited) child.kill('SIGKILL');
  await redis.close();
}
