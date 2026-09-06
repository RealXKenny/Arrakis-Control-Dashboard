import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import { createRequestLogger } from "../lib/logger";
import { getSafeError } from "../lib/errors";
import { checkRateLimit, getClientAddress } from "../lib/rate-limit";

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  return parts.join("; ");
}

export function getRequestCookie(req, name) {
  const cookies = req.headers.cookie || "";

  for (const entry of cookies.split(";")) {
    const [key, ...valueParts] = entry.trim().split("=");

    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return undefined;
}

export function cookies(req, res) {
  return {
    get(name) {
      const value = getRequestCookie(req, name);
      return value === undefined ? undefined : { value };
    },
    set(name, value, options) {
      const existing = res.getHeader("Set-Cookie");
      const nextCookie = serializeCookie(name, value, options);
      const values = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
      res.setHeader("Set-Cookie", [...values, nextCookie]);
    },
  };
}

export class NextResponse {
  constructor(body = null, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = init.headers || {};
  }

  static json(body, init = {}) {
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(init.headers || {}),
      },
    });
  }

  static redirect(url, status = 307) {
    return new NextResponse(null, {
      status,
      headers: { Location: String(url) },
    });
  }
}

export function sendNextResponse(res, response) {
  for (const [name, value] of Object.entries(response.headers || {})) {
    res.setHeader(name, value);
  }

  res.status(response.status);

  if (response.body === null || response.body === undefined) {
    return res.end();
  }

  return res.send(response.body);
}

export function getRequestOrigin(req) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost";
  return `${protocol}://${host}`;
}

export async function runPagesApiHandler(req, res, method, handler) {
  const requestId = req.headers["x-request-id"]?.toString() || randomUUID();
  const route = req.url?.split("?")[0] || "unknown";
  const log = createRequestLogger({ requestId, route, method: req.method });
  res.setHeader("X-Request-ID", requestId);

  if (req.method !== method) {
    res.setHeader("Allow", method);
    res.status(405).json({ ok: false, error: "Method Not Allowed", code: "METHOD_NOT_ALLOWED", requestId });
    return;
  }

  const isSensitive = route.includes("/auth/") || route.includes("/export") || req.method !== "GET";
  const limit = await checkRateLimit(`${getClientAddress(req)}:${route}`, isSensitive ? { limit: 30, windowMs: 60_000 } : { limit: 120, windowMs: 60_000 });
  res.setHeader("X-RateLimit-Limit", isSensitive ? "30" : "120");
  res.setHeader("X-RateLimit-Remaining", String(limit.remaining));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    const status = limit.storageUnavailable ? 503 : 429;
    res.status(status).json({ ok: false, error: status === 429 ? "Too many requests" : "Request protection is temporarily unavailable", code: status === 429 ? "RATE_LIMITED" : "RATE_LIMIT_UNAVAILABLE", requestId });
    return;
  }

  const startedAt = Date.now();
  try {
    await sendNextResponse(res, await handler(req, res));
    log.info("API request completed", { statusCode: res.statusCode, durationMs: Date.now() - startedAt });
  } catch (error) {
    const safeError = getSafeError(error);
    log.error("API request failed", { statusCode: safeError.statusCode, durationMs: Date.now() - startedAt, error });
    if (!res.headersSent) {
      res.status(safeError.statusCode).json({ ok: false, error: safeError.message, code: safeError.code, requestId });
    }
  }
}
