import { exchangeDiscordIdentity } from "../../../infrastructure/discord";
import { AppError } from "../../../lib/errors";
import { NextResponse, getRequestOrigin } from "../../../infrastructure/pages-api";
import { cookies } from "../../../infrastructure/cookies";
import { getServerEnv } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { saveSession, sessionTtlSeconds } from "../../../lib/session-store";
import crypto from "node:crypto";

export async function GET(request, res) {
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

      const appUrl = getServerEnv().APP_URL || new URL(request.url, getRequestOrigin(request)).origin;

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

    const { userData, memberData } = await exchangeDiscordIdentity(code, { clientId, clientSecret, guildId, redirectUri });

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
      secure: getServerEnv().NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtlSeconds(),
      path: "/",
    });
    cookieStore.set("oauth_state", "", {
      httpOnly: true,
      secure: getServerEnv().NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    });

    return NextResponse.redirect(new URL("/portal", appUrl));
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error("Discord callback failed", error);
    return NextResponse.json(
      {
        error: "Internal server token processing error",
      },
      { status: 500 },
    );
  }
}

