import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

// Isolated transport fixture: no real Redis, Discord, or Dune credentials are used.
const redis = createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/auth/login") res.setHeader("Set-Cookie", "asc_session=fixture; Path=/; HttpOnly");
    const payload = req.url === "/api/auth/state" ? { csrfToken: "fixture-csrf" }
      : req.url === "/api/integrations/discord/players/me" ? { linked: true, pawnId: "player", characterName: "Tester" }
      : req.url.endsWith("/bases") ? { rows: Array.from({ length: 8 }, (_, id) => ({ id: String(id) })) }
      : { rows: [], totalCount: 0, map: { width: 1000, height: 1000 } };
    res.end(JSON.stringify(payload));
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const command = JSON.parse(body || "[]");
  const reply = entry => ({ result: String(entry[0]).toUpperCase() === "GET" ? Buffer.from(JSON.stringify({ user: { id: "user" }, guildId: "guild", roleIds: [], expiresAt: Date.now() + 3600000 })).toString("base64") : "OK" });
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(Array.isArray(command[0]) ? command.map(reply) : reply(command)));
});
redis.listen(0, "127.0.0.1");
await once(redis, "listening");
const redisPort = redis.address().port;
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));

const require = createRequire(import.meta.url);
const manifestPath = ".next/routes-manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tunnelRewrites = manifest.rewrites.afterFiles.filter(route => route.source.startsWith("/monitoring"));
assert.equal(tunnelRewrites.length, 0, "Sentry must use direct transport, not the external rewrite proxy");
const mode = process.env.SMOKE_NEXT_MODE === "dev" ? "dev" : "start";
const child = spawn(process.execPath, ["--trace-warnings", require.resolve("next/dist/bin/next"), mode, "--hostname", "127.0.0.1", "--port", String(port)], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: mode === "dev" ? "development" : "production",
    CONSOLE_URL: `http://127.0.0.1:${redisPort}`, CONSOLE_PASSWORD: "fixture-password", ADAPTER_TOKEN: "fixture-token",
    DISCORD_CLIENT_ID: "", DISCORD_CLIENT_SECRET: "", DISCORD_GUILD_ID: "",
    DISCORD_REDIRECT_URI: "", DISCORD_APP_URL: "", APP_URL: "",
    SENTRY_DSN: `http://fixture@127.0.0.1:${redisPort}/1`, NEXT_PUBLIC_SENTRY_DSN: "", SENTRY_AUTH_TOKEN: "",
    UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${redisPort}`,
    UPSTASH_REDIS_REST_TOKEN: "local-smoke-fixture",
  },
});
let logs = "";
child.stdout.on("data", chunk => { logs += chunk; });
child.stderr.on("data", chunk => { logs += chunk; });
const childDone = new Promise(resolve => { child.once("exit", resolve); child.once("error", resolve); });

try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Production server exited before becoming ready");
    try {
      const response = await fetch(`${base}/portal`, { signal: AbortSignal.timeout(1000) });
      ready = response.status === 200;
      await response.text();
      if (ready) break;
    } catch { /* Startup may still be loading instrumentation. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, "Production server must serve /portal");
  const routes = ["auth/login", "auth/callback", "auth/logout", "map", "player", "market", "market/config", "bases/test/export", "server/status"];
  for (const route of routes) {
    const response = await fetch(`${base}/api/${route}`, { method: "POST", signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 405, route);
    assert.equal((await response.json()).code, "METHOD_NOT_ALLOWED", route);
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const route of ["player", "map", "market", "market/config", "bases/test/export"]) {
      const response = await fetch(`${base}/api/${route}`, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 401, route);
      assert.equal(response.headers.get("CDN-Cache-Control"), "no-store");
      assert.equal((await response.json()).code, "UNAUTHORIZED", route);
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${base}/api/player`, { headers: { cookie: "dashboard_session=fixture-session" }, signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, "authenticated player telemetry");
    assert.equal((await response.json()).linked, true);
  }
  const monitoringResponse = await fetch(`${base}/monitoring?o=1&p=1`, { method: "POST", body: "fixture" });
  assert.equal(monitoringResponse.status, 404);
  await monitoringResponse.text();
  if (logs.includes("MaxListenersExceededWarning")) console.error(logs.slice(logs.indexOf("MaxListenersExceededWarning"), logs.indexOf("MaxListenersExceededWarning") + 2500));
  assert.doesNotMatch(logs, /Failed to load external module|MaxListenersExceededWarning|This module cannot be imported from a Client Component/);
  console.log("Runtime smoke passed: portal, 9 API modules, 100 unauthorized requests, 3 authenticated telemetry requests, monitoring route; no import or listener warnings.");
} finally {
  child.kill();
  await childDone;
  redis.closeAllConnections();
  await new Promise(resolve => redis.close(resolve));
}
