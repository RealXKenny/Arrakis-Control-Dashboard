import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import login from "../src/pages/api/auth/login";
import callback from "../src/pages/api/auth/callback";
import logout from "../src/pages/api/auth/logout";
import map from "../src/pages/api/map";
import player from "../src/pages/api/player";
import market from "../src/pages/api/market";
import marketConfig from "../src/pages/api/market/config";
import exportBase from "../src/pages/api/bases/[baseId]/export";
import status from "../src/pages/api/server/status";
import { runPagesApiHandler, NextResponse } from "../src/infrastructure/pages-api";
import { getDuneClient } from "../src/infrastructure/dune";
import { getSession, saveSession } from "../src/lib/session-store";
import { checkRateLimit } from "../src/lib/rate-limit";
import { responseMock } from "./helpers/response";

vi.mock("../src/infrastructure/dune", () => ({ getDuneClient: vi.fn(), getDiscordPlayer: vi.fn() }));
vi.mock("../src/lib/session-store", () => ({ getSession: vi.fn(), saveSession: vi.fn(), deleteSession: vi.fn(), sessionTtlSeconds: () => 86400 }));
vi.mock("../src/lib/rate-limit", () => ({ checkRateLimit: vi.fn(), getClientAddress: () => "test" }));
vi.mock("../src/config/env", () => ({ getServerEnv: () => ({ NODE_ENV: "test", LOG_LEVEL: "INFO", DISCORD_CLIENT_ID: "client", DISCORD_CLIENT_SECRET: "secret", DISCORD_GUILD_ID: "guild", DISCORD_REDIRECT_URI: "https://dashboard.test/auth/callback", DISCORD_APP_URL: "https://dashboard.test" }) }));

const routes = [
  ["/api/auth/login", login], ["/api/auth/callback", callback], ["/api/auth/logout", logout],
  ["/api/map", map], ["/api/player", player], ["/api/market", market],
  ["/api/market/config", marketConfig], ["/api/bases/base/export", exportBase], ["/api/server/status", status],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 29, retryAfter: 60 });
  vi.mocked(getSession).mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("route contracts after extraction", () => {
  it.each(routes)("rejects unsupported methods at %s before accessing providers", async (url, handler) => {
    const res = responseMock();
    await handler({ method: "POST", url, headers: { "x-request-id": "trace" } }, res);
    expect(res.statusCode).toBe(405);
    expect(res.getHeader("Allow")).toBe("GET");
    expect(res.body).toMatchObject({ requestId: "trace", code: "METHOD_NOT_ALLOWED" });
    expect(getDuneClient).not.toHaveBeenCalled();
  });

  it.each(routes.slice(3, 8))("requires a session at %s before accessing providers", async (url, handler) => {
    const res = responseMock();
    await handler({ method: "GET", url, headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body as string)).toMatchObject({ ok: false, code: "UNAUTHORIZED", requestId: res.getHeader("X-Request-ID") });
    expect(getDuneClient).not.toHaveBeenCalled();
  });

  it("returns a protected error when rate-limit storage is unavailable", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 5, storageUnavailable: true });
    const handler = vi.fn();
    const res = responseMock();
    await runPagesApiHandler({ method: "GET", url: "/api/test", headers: {} }, res, "GET", handler);
    expect(res.statusCode).toBe(503);
    expect(res.getHeader("Retry-After")).toBe("5");
    expect(handler).not.toHaveBeenCalled();
  });

  it("catches unexpected rate-limit failures inside the API boundary", async () => {
    vi.mocked(checkRateLimit).mockRejectedValue(new Error("private storage details"));
    const res = responseMock();
    await runPagesApiHandler({ method: "GET", url: "/api/test", headers: {} }, res, "GET", () => NextResponse.json({ ok: true }));
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: "Internal server error", code: "INTERNAL_ERROR" });
    expect(JSON.stringify(res.body)).not.toContain("private storage");
  });

  it("preserves the blueprint attachment without adding an API envelope", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "user" }, guildId: "guild", roleIds: [], expiresAt: Date.now() + 60000 });
    vi.mocked(getDuneClient).mockReturnValue({ request: vi.fn().mockResolvedValue({ blueprint: [1, 2] }) });
    const res = responseMock();
    await exportBase({ method: "GET", url: "/api/bases/base/export", headers: { cookie: "dashboard_session=session" }, query: { baseId: "base" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Disposition")).toBe('attachment; filename="base-base.json"');
    expect(JSON.parse(res.body as string)).toEqual({ blueprint: [1, 2] });
  });

  it("hides upstream failure details in market responses", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "user" }, guildId: "guild", roleIds: [], expiresAt: Date.now() + 60000 });
    vi.mocked(getDuneClient).mockReturnValue({ request: vi.fn().mockRejectedValue(new Error("provider-secret")) });
    const res = responseMock();
    await market({ method: "GET", url: "/api/market", headers: { cookie: "dashboard_session=session" } }, res);
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body as string)).toMatchObject({ code: "UPSTREAM_ERROR", error: "Unable to load market data", requestId: res.getHeader("X-Request-ID") });
    expect(res.body).not.toContain("provider-secret");
  });

  it("persists an opaque session and clears OAuth state after a successful callback", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "provider-secret" }))
      .mockResolvedValueOnce(Response.json({ id: "user", username: "tester" }))
      .mockResolvedValueOnce(Response.json({ roles: ["member"] }));
    vi.stubGlobal("fetch", fetchMock);
    const res = responseMock();
    await callback({ method: "GET", url: "/api/auth/callback?code=code&state=state", headers: { host: "dashboard.test", cookie: "oauth_state=state" } }, res);
    expect(res.statusCode).toBe(307);
    expect(res.getHeader("Location")).toBe("https://dashboard.test/portal");
    expect(saveSession).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), expect.objectContaining({ user: expect.objectContaining({ id: "user" }), roleIds: ["member"] }));
    const cookies = res.getHeader("Set-Cookie") as string[];
    expect(cookies[0]).toMatch(/^dashboard_session=[a-f0-9]{64};/);
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[1]).toContain("oauth_state=; Max-Age=0");
    expect(JSON.stringify([cookies, vi.mocked(saveSession).mock.calls])).not.toContain("provider-secret");
  });
});
