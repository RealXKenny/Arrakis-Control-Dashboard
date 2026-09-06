import { NextResponse, cookies, getRequestOrigin, runPagesApiHandler } from "../../../../infrastructure/pages-api";
import { getServerEnv } from "../../../../config/env";
import { logger } from "../../../../lib/logger";
import { saveSession, sessionTtlSeconds } from "../../../../lib/session-store";
import crypto from "node:crypto";

async function GET(request, res) {
  try {
    const { searchParams } = new URL(request.url, getRequestOrigin(request));

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const expectedState = cookies(request, res).get("oauth_state")?.value;

    if (!state || !expectedState || state !== expectedState) {
      return NextResponse.json({ ok: false, error: "Invalid authentication request.", code: "INVALID_OAUTH_STATE" }, { status: 400 });
    }
    const oauthError = searchParams.get("error");

    if (oauthError) {
      logger.warn("Discord OAuth provider returned an error");

      const appUrl = process.env.APP_URL || new URL(request.url, getRequestOrigin(request)).origin;

      return NextResponse.redirect(new URL("/?error=discord_denied", appUrl));
    }

    if (!code) {
      logger.warn("Discord callback missing authorization code");

      return NextResponse.json({ error: "Missing Discord authorization code" }, { status: 400 });
    }

    const env = getServerEnv();
    const clientId = env.DISCORD_CLIENT_ID;
    const clientSecret = env.DISCORD_CLIENT_SECRET;
    const guildId = env.DISCORD_GUILD_ID;
    const redirectUri = env.DISCORD_REDIRECT_URI;
    const appUrl = env.DISCORD_APP_URL || new URL(request.url, getRequestOrigin(request)).origin;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json({ ok: false, error: "Authentication is temporarily unavailable.", code: "AUTH_CONFIG_MISSING" }, { status: 500 });
    }

    if (!guildId) {
      return NextResponse.json({ ok: false, error: "Authentication is temporarily unavailable.", code: "AUTH_CONFIG_MISSING" }, { status: 500 });
    }

    const bodyParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyParams,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    const responseText = await tokenResponse.text();

    let tokenData;

    try {
      tokenData = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid response from Discord.", code: "OAUTH_PROVIDER_ERROR" }, { status: 502 });
    }

    if (!tokenResponse.ok) {
      return NextResponse.json({ ok: false, error: "Authentication was declined.", code: "OAUTH_REJECTED" }, { status: 400 });
    }

    if (!tokenData.access_token) {
      return NextResponse.json({ ok: false, error: "Authentication was declined.", code: "OAUTH_REJECTED" }, { status: 400 });
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      return NextResponse.json({ error: "Failed to retrieve Discord user" }, { status: 400 });
    }

    const memberUrl = `https://discord.com/api/guilds/${guildId}/members/@me`;

    const memberResponse = await fetch(memberUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    let memberData = {};

    if (memberResponse.ok) {
      memberData = await memberResponse.json();
    }

    const rolesArray = Array.isArray(memberData.roles) ? memberData.roles : [];

    const sessionId = crypto.randomBytes(32).toString("hex");

    await saveSession(sessionId, {
      user: {
        id: String(userData.id),
        username: typeof userData.username === "string" ? userData.username : undefined,
        global_name: typeof userData.global_name === "string" ? userData.global_name : undefined,
        avatar: typeof userData.avatar === "string" ? userData.avatar : null,
      },
      guildId,
      roleIds: rolesArray,
      expiresAt: Date.now() + sessionTtlSeconds() * 1000,
    });

    const cookieStore = cookies(request, res);

    cookieStore.set("dashboard_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtlSeconds(),
      path: "/",
    });
    cookieStore.set("oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    });

    return NextResponse.redirect(new URL("/portal", appUrl));
  } catch (error) {
    return NextResponse.json(
      {
        error: "Internal server token processing error",
      },
      { status: 500 },
    );
  }
}

export default function handler(req, res) {
  return runPagesApiHandler(req, res, "GET", GET);
}
