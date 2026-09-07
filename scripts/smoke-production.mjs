import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// Isolated transport fixture: no real Redis, Discord, or Dune credentials are used.
const redis = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const command = JSON.parse(body || "[]");
  const reply = entry => ({ result: String(entry[0]).toUpperCase() === "GET" ? null : "OK" });
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
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    CONSOLE_URL: "", CONSOLE_PASSWORD: "", ADAPTER_TOKEN: "",
    DISCORD_CLIENT_ID: "", DISCORD_CLIENT_SECRET: "", DISCORD_GUILD_ID: "",
    DISCORD_REDIRECT_URI: "", DISCORD_APP_URL: "", APP_URL: "",
    SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "", SENTRY_AUTH_TOKEN: "",
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
      assert.equal((await response.json()).code, "UNAUTHORIZED", route);
    }
  }
  assert.doesNotMatch(logs, /Failed to load external module|MaxListenersExceededWarning|This module cannot be imported from a Client Component/);
  console.log("Production smoke passed: portal, all 9 API modules, 100 protected requests; no import or listener warnings.");
} finally {
  child.kill();
  await childDone;
  redis.closeAllConnections();
  await new Promise(resolve => redis.close(resolve));
}
