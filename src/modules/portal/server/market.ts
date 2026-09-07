import { NextResponse } from "../../../infrastructure/pages-api";
import { cookies } from "../../../infrastructure/cookies";
import { getDuneClient } from "../../../infrastructure/dune";
import { getSession } from "../../../lib/session-store";


export async function GET(req, res) {
  try {
    const sessionId = cookies(req, res).get("dashboard_session")?.value;
    const session = sessionId ? await getSession(sessionId) : null;
    if (!sessionId || !session || session.expiresAt < Date.now()) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const client = getDuneClient();
    const [stats, items, config, marketConfig] = await Promise.all([
      client.request("GET", "/api/exchange/stats"),
      client.request("GET", "/api/exchange/items?page=0&pageSize=100"),
      client.request("GET", "/api/exchange/config"),
      client.request("GET", "/api/exchange/market"),
    ]);

    const payload = { stats, items, config, marketConfig };
    return NextResponse.json({ ok: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Unable to load market data" }, { status: 502 });
  }
}

