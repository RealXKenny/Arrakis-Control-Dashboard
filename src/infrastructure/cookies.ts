import '../lib/assert-server';
type CookieOptions = {
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
};

function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
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

  return parts.join('; ');
}

export function getRequestCookie(req, name) {
  const cookies = req.headers.cookie || '';

  for (const entry of cookies.split(';')) {
    const [key, ...valueParts] = entry.trim().split('=');

    if (key === name) {
      return decodeURIComponent(valueParts.join('='));
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
      const nextCookie = serializeCookie(name, value, options);
      const values = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
      res.setHeader('Set-Cookie', [...values, nextCookie]);
    },
  };
}
