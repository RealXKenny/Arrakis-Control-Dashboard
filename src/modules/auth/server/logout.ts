import { getServerEnv } from "../../../config/env";
import { NextResponse, getRequestOrigin } from "../../../infrastructure/pages-api";
import { cookies } from "../../../infrastructure/cookies";
import { deleteSession } from "../../../lib/session-store";

export async function POST(req, res) {
  const requestOrigin = getRequestOrigin(req);
  if (req.headers["sec-fetch-site"] === "cross-site" || (req.headers.origin && req.headers.origin !== requestOrigin)) {
    return NextResponse.json({ ok: false, error: "Invalid logout request", code: "INVALID_ORIGIN" }, { status: 403 });
  }
  const cookieStore = cookies(req, res);
  const sessionId = cookieStore.get("dashboard_session")?.value;

  if (sessionId) await deleteSession(sessionId);

  cookieStore.set("dashboard_session", "", {
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    maxAge: 0,
    path: "/",
  });

  const env = getServerEnv();
  const appUrl = env.APP_URL || env.DISCORD_APP_URL || requestOrigin;
  return NextResponse.redirect(new URL("/", appUrl), 303);
}
