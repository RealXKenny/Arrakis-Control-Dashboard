import { responseMock } from "./helpers/response";
import { describe, expect, it } from "vitest";
import { NextResponse, runPagesApiHandler } from "../src/infrastructure/pages-api";
import authCallback from "../src/pages/api/auth/callback/index";
import marketConfig from "../src/pages/api/market/config/index";

describe("Pages API boundary", () => {
  it("returns successful responses with a request ID", async () => {
    const req = { method: "GET", url: "/api/test", headers: {} };
    const res = responseMock();
    await runPagesApiHandler(req, res, "GET", async () => NextResponse.json({ ok: true, data: "value" }));
    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(res.getHeader("Cloudflare-CDN-Cache-Control")).toBe("no-store");
    expect(res.body).toContain('"ok":true');
  });

  it("rejects invalid methods safely", async () => {
    const req = { method: "POST", url: "/api/test", headers: {} };
    const res = responseMock();
    await runPagesApiHandler(req, res, "GET", async () => NextResponse.json({ ok: true }));
    expect(res.statusCode).toBe(405);
    expect(res.body).toMatchObject({ ok: false, code: "METHOD_NOT_ALLOWED" });
  });

  it("hides unexpected handler failures", async () => {
    const req = { method: "GET", url: "/api/failure", headers: {} };
    const res = responseMock();
    await runPagesApiHandler(req, res, "GET", async () => {
      throw new Error("upstream secret");
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  });

  it("rejects an OAuth callback with an invalid state", async () => {
    const req = { method: "GET", url: "/api/auth/callback?code=code&state=invalid", headers: {} };
    const res = responseMock();
    await authCallback(req, res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string)).toMatchObject({ ok: false, code: "INVALID_OAUTH_STATE" });
  });

  it("rejects protected routes without a session", async () => {
    const req = { method: "GET", url: "/api/market/config", headers: {} };
    const res = responseMock();
    await marketConfig(req, res);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body as string)).toMatchObject({ ok: false, error: "Unauthorized" });
  });
});
