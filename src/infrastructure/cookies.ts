import '../lib/assert-server';
import { getServerEnv } from '../config/env';
type CookieOptions = {
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  priority?: 'low' | 'medium' | 'high';
};

const MAX_COOKIE_HEADER_BYTES = 16 * 1024;
const MAX_COOKIE_VALUE_LENGTH = 4096;

function deployedCookieName(name: string): string {
  if (getServerEnv().NODE_ENV !== 'production') return name;
  if (name === 'dashboard_session') return '__Host-dashboard_session';
  if (name === 'oauth_state') return '__Secure-oauth_state';
  return name;
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error('Invalid cookie name');
  if (value.length > MAX_COOKIE_VALUE_LENGTH || /[\u0000-\u001f\u007f]/.test(value))
    throw new Error('Invalid cookie value');
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.priority) {
    parts.push(`Priority=${options.priority[0].toUpperCase()}${options.priority.slice(1)}`);
  }

  return parts.join('; ');
}

export function getRequestCookie(req, name) {
  const cookies = req.headers.cookie || '';
  if (typeof cookies !== 'string' || Buffer.byteLength(cookies) > MAX_COOKIE_HEADER_BYTES) return undefined;
  const deployedName = deployedCookieName(name);

  for (const entry of cookies.split(';')) {
    const [key, ...valueParts] = entry.trim().split('=');

    if (key === deployedName) {
      const encoded = valueParts.join('=');
      if (encoded.length > MAX_COOKIE_VALUE_LENGTH * 3) return undefined;
      try {
        const value = decodeURIComponent(encoded);
        return value.length <= MAX_COOKIE_VALUE_LENGTH ? value : undefined;
      } catch {
        return undefined;
      }
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
    set(name: string, value: string, options: CookieOptions) {
      const existing = res.getHeader('Set-Cookie');
      const nextCookie = serializeCookie(deployedCookieName(name), value, options);
      const values = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
      res.setHeader('Set-Cookie', [...values, nextCookie]);
    },
  };
}
