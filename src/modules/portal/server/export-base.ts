import { NextResponse } from "../../../infrastructure/pages-api";
import { cookies } from "../../../infrastructure/cookies";

import { getDuneClient } from "../../../infrastructure/dune";
import { getSession } from "../../../lib/session-store";


export async function GET(request, res) {
  try {
    const sessionId = cookies(request, res).get("dashboard_session")?.value;
    const session = sessionId ? await getSession(sessionId) : null;

    if (!sessionId || !session || session.expiresAt < Date.now()) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const baseId = request.query.baseId;
    if (!baseId) {
      return NextResponse.json({ ok: false, error: "Missing base ID" }, { status: 400 });
    }

    const blueprint = await getDuneClient().request("GET", `/api/bases/${encodeURIComponent(baseId)}/export`);

    return new NextResponse(JSON.stringify(blueprint, null, 2), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="base-${String(baseId).replace(/[^a-zA-Z0-9_-]/g, "_")}.json"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Unable to export base" }, { status: 502 });
  }
}

