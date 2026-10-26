import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createRedisFixture } from './redis-resp.mjs';

// Isolated browser fixture only; the production Docker build excludes tests/.
const sessionKey = (id) => `arrakis:session:${createHash('sha256').update(id).digest('hex')}`;
const storage = createRedisFixture(([operation, key]) => {
  if (operation.toUpperCase() === 'EVAL') return [1, 60000];
  if (operation.toUpperCase() === 'GET') {
    const admin = key === sessionKey('browser-admin-session');
    const member = key === sessionKey('browser-member-session');
    return admin || member
      ? JSON.stringify({
          user: {
            id: admin ? '456084885220884480' : '123456789000000000',
            username: admin ? 'Test administrator' : 'Test member',
          },
          guildId: 'browser-test-guild',
          roleIds: ['browser-test-role'],
          expiresAt: Date.now() + 3600000,
        })
      : null;
  }
  return 'OK';
});
storage.server.listen(0, '127.0.0.1');
await once(storage.server, 'listening');
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3100'],
  {
    windowsHide: true,
    stdio: 'inherit',
    env: { ...process.env, REDIS_URL: `redis://127.0.0.1:${storage.server.address().port}/0` },
  },
);
const stop = () => child.kill();
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
child.once('error', async () => {
  process.exitCode = 1;
  await storage.close();
});
child.once('exit', async (code) => {
  process.exitCode = code ?? 1;
  await storage.close();
});
