import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRedisFixture } from './helpers/redis-resp.mjs';
import { announceReadiness } from '../scripts/server-launcher.mjs';

let revoked = false;
let upstreamReads = 0;
const redis = createServer(async (req, res) => {
  // Dev note: fake services only; production did not consent to this experiment.
  if (req.url.startsWith('/api/')) {
    if (
      req.url.startsWith('/api/backups/fixture/download') &&
      req.headers.authorization === 'Bearer fixture-admin-console-key'
    ) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end('fixture-backup-bytes');
      return;
    }
    if (req.url.startsWith('/api/server/status') && req.headers.authorization === 'Bearer fixture-admin-console-key') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          schemaVersion: 1,
          ok: true,
          data: { summary: { overall: 'READY' } },
          apiKey: 'fixture-admin-console-key',
        }),
      );
      return;
    }
    const expectedToken = req.url === '/api/integrations/discord/players/me' ? 'fixture-token' : 'fixture-console-key';
    if (req.headers.authorization !== `Bearer ${expectedToken}`) {
      res.statusCode = 401;
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    if (!req.url.startsWith('/api/1/envelope/')) upstreamReads++;
    res.setHeader('Content-Type', 'application/json');
    const payload =
      req.url === '/api/realtime/objects'
        ? {
            gen: 1,
            t: Date.now(),
            sources: [{ map: 'Survival_1', partition: 1, ready: true }],
            objects: [{ i: 1, k: 'worm', s: 0, x: 10, y: 20, z: 30 }],
          }
        : req.url === '/api/integrations/discord/players/me'
          ? { linked: true, pawnId: 'player', characterName: 'Tester' }
          : req.url.endsWith('/bases')
            ? { rows: Array.from({ length: 8 }, (_, id) => ({ id: String(id) })) }
            : { rows: [], totalCount: 0, map: { width: 1000, height: 1000 } };
    res.end(JSON.stringify(payload));
    return;
  }
  res.end('{}');
});
redis.listen(0, '127.0.0.1');
await once(redis, 'listening');
const redisPort = redis.address().port;
const storage = createRedisFixture((entry) => {
  const operation = entry[0].toUpperCase();
  if (operation === 'EVAL') return [1, 60000];
  if (operation === 'DEL') {
    revoked = true;
    return 1;
  }
  if (operation === 'GET')
    if (entry[1] === `arrakis:session:${createHash('sha256').update('fixture-admin-session').digest('hex')}`)
      return JSON.stringify({
        user: { id: '456084885220884480' },
        guildId: 'fixture-guild',
        roleIds: ['fixture-role'],
        authenticatedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        verifiedAt: Date.now(),
      });
  if (operation === 'GET')
    return revoked
      ? null
      : JSON.stringify({
          user: { id: 'user' },
          guildId: 'fixture-guild',
          roleIds: [],
          authenticatedAt: Date.now(),
          expiresAt: Date.now() + 3600000,
          verifiedAt: Date.now(),
        });
  return 'OK';
});
storage.server.listen(0, '127.0.0.1');
await once(storage.server, 'listening');
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
const base = `http://127.0.0.1:${port}`;
await new Promise((resolve) => reservation.close(resolve));

const require = createRequire(import.meta.url);
const mode = process.env.SMOKE_NEXT_MODE === 'dev' ? 'dev' : 'start';
const child = spawn(
  process.execPath,
  ['--trace-warnings', require.resolve('next/dist/bin/next'), mode, '--hostname', '127.0.0.1', '--port', String(port)],
  {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: mode === 'dev' ? 'development' : 'production',
      CONSOLE_URL: `http://127.0.0.1:${redisPort}`,
      CONSOLE_API_KEY: 'fixture-console-key',
      ADMIN_CONSOLE_API_KEY: 'fixture-admin-console-key',
      ADAPTER_TOKEN: 'fixture-token',
      DISCORD_CLIENT_ID: 'fixture-client',
      DISCORD_CLIENT_SECRET: 'fixture-secret',
      DISCORD_GUILD_ID: 'fixture-guild',
      VERIFIED_MEMBER_ROLE_ID: 'fixture-role',
      APP_URL: base,
      REDIS_URL: `redis://127.0.0.1:${storage.server.address().port}/0`,
      REDIS_CLUSTER_NODES: '',
      BOT_API_TOKEN: 'fixture-independent-bot-api-credential-32',
    },
  },
);
let logs = '';
child.stdout.on('data', (chunk) => {
  logs += chunk;
});
child.stderr.on('data', (chunk) => {
  logs += chunk;
});
const childDone = new Promise((resolve) => {
  child.once('exit', resolve);
  child.once('error', resolve);
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Production server exited before becoming ready');
    try {
      const response = await fetch(`${base}/portal`, { signal: AbortSignal.timeout(1000) });
      ready = response.status === 200;
      await response.text();
      if (ready) break;
    } catch {
      /* Dev note: instrumentation may still be putting on its stillsuit. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Production server must serve /portal');
  const optimizedImage = await fetch(`${base}/_next/image?url=%2Fmaps%2Fatreides.webp&w=64&q=75`, {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(optimizedImage.status, 200, 'image optimizer must serve an image');
  assert.match(optimizedImage.headers.get('content-type') || '', /^image\//);
  assert.ok((await optimizedImage.arrayBuffer()).byteLength > 0);
  const readinessMessages = [];
  await announceReadiness(`${base}/portal`, new AbortController().signal, {
    write: (message) => readinessMessages.push(message),
  });
  assert.deepEqual(readinessMessages, ['Ready in — Arrakis Control Dashboard is listening (HTTP check passed).']);
  for (const [asset, contentType] of [
    ['/favicon.ico', 'image/x-icon'],
    ['/api/assets/terrain/hagga.json.gz', 'application/gzip'],
    ['/api/assets/models/native/catalog.json.gz', 'application/gzip'],
    ['/maps/atreides.webp', 'image/webp'],
    ['/maps/hagga-basin/0-0.webp', 'image/webp'],
    ['/items/MelangeSpice.png', 'image/png'],
  ]) {
    const response = await fetch(`${base}${asset}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, asset);
    assert.equal(response.headers.get('content-type'), contentType, asset);
    assert.ok((await response.arrayBuffer()).byteLength > 0, asset);
  }
  const entry = await fetch(`${base}/home?theme=default&source=bookmark`, { redirect: 'manual' });
  assert.equal(entry.status, 307);
  const landingUrl = new URL(entry.headers.get('location'), base);
  assert.equal(landingUrl.pathname, '/');
  assert.equal(landingUrl.searchParams.get('theme'), 'default');
  assert.equal(landingUrl.searchParams.get('source'), 'bookmark');
  await entry.text();
  const sessionCookie = '__Host-dashboard_session=fixture-session';
  const home = await fetch(`${base}/`, { headers: { cookie: sessionCookie } });
  const botDenied = await fetch(`${base}/api/v1/bot/world`);
  assert.equal(botDenied.status, 401);
  const botWorld = await fetch(`${base}/api/v1/bot/world?map=DeepDesert`, {
    headers: { Authorization: 'Bearer fixture-independent-bot-api-credential-32' },
  });
  assert.equal(botWorld.status, 200);
  const botReading = await botWorld.json();
  assert.equal(botReading.apiVersion, '1');
  assert.equal(botReading.data.map, 'DeepDesert');
  assert.equal(botReading.data.rows, undefined, 'bot receives normalized world data only');
  assert.match(botWorld.headers.get('cache-control'), /no-store/);
  const adminHeaders = {
    cookie: '__Host-dashboard_session=fixture-admin-session',
    Origin: base,
    'Content-Type': 'application/json',
  };
  const adminPage = await fetch(`${base}/admin`, { headers: adminHeaders });
  assert.equal(adminPage.status, 200, 'administrator page checks the server session');
  const memberAdmin = await fetch(`${base}/api/v2/admin/catalog`, { headers: { cookie: sessionCookie } });
  assert.equal(memberAdmin.status, 403, 'ordinary members cannot inspect admin operations');
  const adminCatalog = await fetch(`${base}/api/v2/admin/catalog`, { headers: adminHeaders });
  assert.equal((await adminCatalog.json()).operations.length, 383);
  for (const path of [
    'v2/admin/overview',
    'admin/guilds/test/applications',
    'admin/guilds/test/applications/' + 'a'.repeat(64) + '/messages',
    'admin/guilds/test/messages',
  ]) {
    const response = await fetch(`${base}/api/${path}`, { headers: { cookie: sessionCookie } });
    assert.equal(response.status, 403, 'guild oversight requires the verified administrator');
    await response.text();
  }
  for (const path of [
    'admin/guilds/test/messages/send',
    'guilds/test/support/send',
    'admin/guilds/test/messages/read',
    'guilds/test/support/read',
  ]) {
    const response = await fetch(`${base}/api/${path}`, {
      method: 'POST',
      headers: { ...adminHeaders, Origin: 'https://other.example' },
      body: '{}',
    });
    assert.equal(response.status, 403, 'guild support rejects cross-site sends');
    await response.text();
    const wrong = await fetch(`${base}/api/${path}`);
    assert.equal(wrong.status, 405);
    await wrong.text();
  }
  const supportStatusDenied = await fetch(`${base}/api/guilds/test/support/status`);
  assert.equal(supportStatusDenied.status, 401, 'support unread counts require authentication');
  await supportStatusDenied.text();
  const overviewResponse = await fetch(`${base}/api/v2/admin/overview`, { headers: adminHeaders });
  assert.equal(overviewResponse.status, 200, 'admin statistics remain usable with partial Console permissions');
  const overviewData = await overviewResponse.json();
  assert.equal(overviewData.data.sources.length, 10);
  assert.equal(overviewData.data.metrics.find((metric) => metric.id === 'health').value, 'READY');
  assert.doesNotMatch(JSON.stringify(overviewData), /fixture-admin-console-key/);
  const adminStatus = await fetch(`${base}/api/v2/admin/execute`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ operation: 'get-server-status' }),
  });
  assert.equal(adminStatus.status, 200);
  const adminReading = await adminStatus.text();
  assert.match(adminReading, /READY/);
  assert.doesNotMatch(adminReading, /fixture-admin-console-key/);
  const adminDownload = await fetch(`${base}/api/v2/admin/execute`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ operation: 'get-backups-backup-download', path: { backup: 'fixture' } }),
  });
  assert.equal(adminDownload.headers.get('content-type'), 'application/octet-stream');
  assert.equal(
    await adminDownload.text(),
    'fixture-backup-bytes',
    'binary responses stream through the common API boundary',
  );
  assert.equal(home.status, 200, 'homepage with a session cookie');
  assert.match(await home.text(), /Command the/i, 'V2 landing page renders');
  const rootLanding = await fetch(`${base}/`);
  assert.equal(rootLanding.status, 200, 'root directly serves the public landing page');
  assert.equal(new URL(rootLanding.url).pathname, '/');
  const rootLandingHtml = await rootLanding.text();
  assert.match(rootLandingHtml, /Everything the Landsraad would hide/);
  assert.match(rootLandingHtml, /Sign in with Discord/);
  assert.match(rootLandingHtml, /<meta property="og:title" content="Arrakis Control"/);
  assert.doesNotMatch(rootLandingHtml, /Harvesting sectors/, 'the removed operations dashboard is not served');
  const routes = [
    'v1/bot/world',
    'map',
    'map/realtime',
    'player',
    'market',
    'market/config',
    'market/listings',
    'portal/world',
    'bases/test/export',
    'server/status',
    'bases/import',
    'session',
  ];
  for (const route of routes) {
    const response = await fetch(`${base}/api/${route}`, {
      method: route === 'bases/import' ? 'GET' : 'POST',
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 405, route);
    assert.equal((await response.json()).code, 'METHOD_NOT_ALLOWED', route);
  }
  for (const route of ['guilds/test/application', 'guilds/test/applications']) {
    const methodDenied = await fetch(`${base}/api/${route}`, { method: 'PUT' });
    assert.equal(methodDenied.status, 405, route);
    await methodDenied.text();
    const unauthorized = await fetch(`${base}/api/${route}`);
    assert.equal(unauthorized.status, 401, route);
    assert.equal(unauthorized.headers.get('Cache-Control'), 'private, no-store, max-age=0');
    await unauthorized.text();
    const crossOrigin = await fetch(`${base}/api/${route}`, {
      method: 'POST',
      headers: { cookie: sessionCookie, Origin: 'https://other.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(crossOrigin.status, 403, route);
    await crossOrigin.text();
  }
  const statusRead = await fetch(`${base}/api/guilds/application-status?guildIds=test`);
  assert.equal(statusRead.status, 401, 'application summaries require a session');
  await statusRead.text();
  const chatRoute = `${base}/api/guilds/test/applications/${'a'.repeat(64)}/messages`;
  const chatRead = await fetch(chatRoute, { signal: AbortSignal.timeout(5000) });
  assert.equal(chatRead.status, 401, 'application chat requires a session');
  assert.equal(chatRead.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  await chatRead.text();
  const receiptWrite = await fetch(chatRoute + '/read', {
    method: 'POST',
    headers: { cookie: sessionCookie, Origin: 'https://other.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(receiptWrite.status, 403, 'read receipts reject cross-site writes');
  await receiptWrite.text();
  const receiptWrongMethod = await fetch(chatRoute + '/read');
  assert.equal(receiptWrongMethod.status, 405, 'read receipts require POST');
  await receiptWrongMethod.text();
  const chatWrite = await fetch(`${chatRoute}/send`, {
    method: 'POST',
    headers: { cookie: sessionCookie, Origin: 'https://other.example', 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(chatWrite.status, 403, 'application chat rejects cross-site sends');
  await chatWrite.text();
  const chatWrongMethod = await fetch(`${chatRoute}/send`, { signal: AbortSignal.timeout(5000) });
  assert.equal(chatWrongMethod.status, 405, 'chat sends require POST');
  await chatWrongMethod.text();
  for (const [path, method] of [
    ['guilds/test/members', 'POST'],
    ['guilds/test/members/player', 'DELETE'],
    ['guilds/test/members/player/promote', 'POST'],
    ['guilds/test/members/player/demote', 'POST'],
    ['guilds/test', 'DELETE'],
  ]) {
    const deniedMethod = await fetch(`${base}/api/${path}`, { method: 'PUT', signal: AbortSignal.timeout(5000) });
    assert.equal(deniedMethod.status, 405, path);
    await deniedMethod.text();
    const noSession = await fetch(`${base}/api/${path}`, {
      method,
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(noSession.status, 401, path);
    await noSession.text();
    const foreign = await fetch(`${base}/api/${path}`, {
      method,
      headers: { cookie: sessionCookie, Origin: 'https://other.example', 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(foreign.status, 403, path);
    await foreign.text();
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const route of ['player', 'map', 'market', 'market/config', 'bases/test/export']) {
      const response = await fetch(`${base}/api/${route}`, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 401, route);
      assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
      assert.equal((await response.json()).code, 'UNAUTHORIZED', route);
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${base}/api/player`, {
      headers: { cookie: sessionCookie },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200, 'authenticated player telemetry');
    assert.equal((await response.json()).linked, true);
  }
  const buildId = mode === 'dev' ? 'development' : readFileSync('.next/BUILD_ID', 'utf8').trim();
  const headers = { cookie: sessionCookie };
  for (let attempt = 0; attempt < 2; attempt++) {
    const realtime = await fetch(`${base}/api/map/realtime?map=HaggaBasin`, { headers });
    assert.equal(realtime.status, 200, 'authenticated realtime snapshot');
    const snapshot = await realtime.json();
    assert.equal(snapshot.markers[0].type, 'worm');
    assert.equal(realtime.headers.get('X-Data-Captured-At'), null, 'realtime bypasses the normal API read cache');
  }
  const world = await fetch(`${base}/api/portal/world?map=DeepDesert`, { headers });
  assert.equal(world.status, 200, 'authenticated world briefing');
  const worldReading = await world.json();
  assert.equal(worldReading.map, 'DeepDesert');
  assert.equal(worldReading.spice, null, 'unsupported spice data must not become zero');
  assert.equal(worldReading.rows, undefined, 'raw provider rows must stay server-side');
  const readingBefore = upstreamReads;
  const cachedPlayer = await fetch(`${base}/api/player`, { headers });
  assert.equal(cachedPlayer.status, 200);
  assert.ok(cachedPlayer.headers.get('X-Data-Captured-At'));
  await cachedPlayer.text();
  assert.equal(upstreamReads, readingBefore, 'warm player cache avoids provider calls');
  const market = await fetch(`${base}/api/market`, { headers });
  assert.equal(market.status, 200, 'market remains authenticated after prefetch');
  await market.text();
  // Auth.js sign-out is CSRF-protected: fetch a token (and its cookie) first, then post both.
  const csrf = await fetch(`${base}/api/auth/csrf`, { headers });
  const { csrfToken } = await csrf.json();
  const csrfCookie = (csrf.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; ');
  const logout = await fetch(`${base}/api/auth/signout`, {
    method: 'POST',
    headers: {
      ...headers,
      cookie: [headers.cookie, csrfCookie].filter(Boolean).join('; '),
      origin: base,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ csrfToken }),
    redirect: 'manual',
  });
  const logoutBody = await logout.text();
  assert.ok([200, 302, 303].includes(logout.status), `sign-out responds (${logout.status}): ${logoutBody}`);
  const expired = await fetch(`${base}/api/player`, { headers });
  assert.equal(expired.status, 401, 'intentional logout revokes the Redis session');
  await expired.text();
  const expiredRealtime = await fetch(`${base}/api/map/realtime`, { headers });
  assert.equal(expiredRealtime.status, 401, 'logout revokes realtime access');
  await expiredRealtime.text();
  const signedOutHome = await fetch(`${base}/home`, { headers });
  assert.equal(signedOutHome.status, 200, 'landing with a revoked session cookie');
  assert.match(await signedOutHome.text(), /Sign in with Discord/);
  if (logs.includes('MaxListenersExceededWarning'))
    console.error(
      logs.slice(logs.indexOf('MaxListenersExceededWarning'), logs.indexOf('MaxListenersExceededWarning') + 2500),
    );
  assert.doesNotMatch(
    logs,
    /Failed to load external module|MaxListenersExceededWarning|This module cannot be imported from a Client Component|Failed to write image to cache|unhandledRejection/,
  );
  const deniedImport = await fetch(`${base}/api/bases/import`, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(deniedImport.status, 401);
  await deniedImport.text();
  console.log('Runtime smoke passed: 13 API modules, protected base import, telemetry, market and logout.');
} finally {
  child.kill();
  await childDone;
  await storage.close();
  redis.closeAllConnections();
  await new Promise((resolve) => redis.close(resolve));
}
