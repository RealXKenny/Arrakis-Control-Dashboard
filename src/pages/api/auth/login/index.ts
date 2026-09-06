import { NextResponse, runPagesApiHandler } from "../../../../infrastructure/pages-api";
import { randomBytes } from "node:crypto";
import { cookies } from "../../../../infrastructure/pages-api";
import { getServerEnv } from "../../../../config/env";

async function GET(req, res) {
  try {
    const env = getServerEnv();
    const clientId = env.DISCORD_CLIENT_ID;
    const redirectUri = env.DISCORD_REDIRECT_URI;

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Authentication is temporarily unavailable.", code: "AUTH_CONFIG_MISSING" }, { status: 500 });
    }

    if (!redirectUri) {
      return NextResponse.json({ ok: false, error: "Authentication is temporarily unavailable.", code: "AUTH_CONFIG_MISSING" }, { status: 500 });
    }

    const state = randomBytes(32).toString("hex");
    cookies(req, res).set("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify guilds.members.read",
      state,
    });

    const discordAuthUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;

    return NextResponse.redirect(discordAuthUrl);
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Unable to start authentication.", code: "AUTH_START_FAILED" }, { status: 500 });
  }
}

export default function handler(req, res) {
  return runPagesApiHandler(req, res, "GET", GET);
}
