import { NextResponse, cookies, runPagesApiHandler } from "../../../../infrastructure/pages-api";
import { getDuneClient } from "../../../../infrastructure/dune";
import { getSession } from "../../../../lib/session-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function GET(req, res) {
  const sessionId = cookies(req, res).get("dashboard_session")?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!sessionId || !session || session.expiresAt < Date.now()) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const market = await getDuneClient().request("GET", "/api/exchange/market");
    const buybackPercent = market?.buyback?.buybackPercent ?? market?.buybackSchedule?.buybackPercent ?? market?.schedule?.buybackPercent ?? market?.buybackPercent ?? null;
    return NextResponse.json({ ok: true, buybackPercent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load market config" }, { status: 502 });
  }
}

export default function handler(req, res) {
  return runPagesApiHandler(req, res, "GET", GET);
}
