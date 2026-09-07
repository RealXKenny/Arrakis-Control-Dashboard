import { NextResponse } from "../../../infrastructure/pages-api";
import { cookies } from "../../../infrastructure/cookies";
import { getDuneClient } from "../../../infrastructure/dune";
import { getSession } from "../../../lib/session-store";
import { AppError } from "../../../lib/errors";
import { logger } from "../../../lib/logger";


export async function GET(req, res) {
  try {
    const sessionId = cookies(req, res).get("dashboard_session")?.value;
    const session = sessionId ? await getSession(sessionId) : null;
    if (!sessionId || !session || session.expiresAt < Date.now()) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const params = new URL(req.url, "http://localhost").searchParams;
    const page = params.get("page") ?? "0";
    const q = (params.get("q") ?? "").trim();
    if (!/^\d{1,6}$/.test(page) || q.length > 128) throw new AppError("Invalid market search or page", 400, "INVALID_MARKET_QUERY", true);
    const query = new URLSearchParams({ page, pageSize: "100", q, sortColumn: "display_name", sortDirection: "asc" });
    const client = getDuneClient();
    const [itemsResult, statsResult, marketResult] = await Promise.allSettled([
      client.request("GET", `/api/exchange/items?${query}`),
      client.request("GET", "/api/exchange/stats"),
      client.request("GET", "/api/exchange/market"),
    ]);
    if (itemsResult.status === "rejected") throw itemsResult.reason;
    const items = itemsResult.value;
    const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
    const marketConfig = marketResult.status === "fulfilled" ? marketResult.value : null;
    const warnings = [];
    if (statsResult.status === "rejected") warnings.push("Market totals are temporarily unavailable.");
    if (marketResult.status === "rejected") warnings.push("Buyback configuration is unavailable; listings are still shown.");

    const payload = { stats, items, marketConfig, warnings };
    return NextResponse.json({ ok: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error("Unable to load market", error);
    return NextResponse.json({ ok: false, error: "Unable to load market data" }, { status: 502 });
  }
}
