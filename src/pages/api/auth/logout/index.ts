import { NextResponse, cookies, runPagesApiHandler } from "../../../../infrastructure/pages-api";
import { logger } from "../../../../lib/logger";
import { deleteSession } from "../../../../lib/session-store";

async function GET(req, res) {
  const cookieStore = cookies(req, res);
  const sessionId = cookieStore.get("dashboard_session")?.value;

  try {
    if (sessionId) await deleteSession(sessionId);
  } catch (error) {
    logger.error("Logout failed", { error });
  }

  cookieStore.set("dashboard_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    maxAge: 0,
    path: "/",
  });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL("/", appUrl));
}

export default function handler(req, res) {
  return runPagesApiHandler(req, res, "GET", GET);
}
