/**
 * Pure Clerk configuration helpers shared by the proxy and server handlers.
 * No server-only imports: the proxy bundle and tests can load this directly.
 */

/** Values the proxy reads from `process.env`; empty strings count as absent. */
export type ClerkProxySettings = { provider?: string; publishableKey?: string; secretKey?: string };

/**
 * A publishable key is `pk_(test|live)_` + base64(`<frontend-api-host>$`). Returns the HTTPS origin of
 * that Frontend API host, or null for anything malformed, so CSP never allows an arbitrary origin.
 */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]{10,300})$/.exec(publishableKey ?? '');
  if (!match) return null;
  let decoded: string;
  try {
    decoded = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  if (!decoded.endsWith('$')) return null;
  const host = decoded.slice(0, -1).toLowerCase();
  // Hostnames only: labels of letters, digits and hyphens, at least one dot, no ports or paths.
  if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
  return `https://${host}`;
}

/** Clerk runs only when selected and both keys are present and well formed. */
export function clerkProxyEnabled(settings: ClerkProxySettings): boolean {
  return (
    settings.provider === 'clerk' &&
    /^sk_(?:test|live)_[A-Za-z0-9_-]{20,200}$/.test(settings.secretKey ?? '') &&
    clerkFrontendApiOrigin(settings.publishableKey) !== null
  );
}

/** Extra CSP sources Clerk's sign-in UI needs: its own Frontend API, avatars, and Cloudflare bot protection. */
export function clerkContentSecurityPolicySources(publishableKey: string | undefined) {
  const frontendApi = clerkFrontendApiOrigin(publishableKey);
  if (!frontendApi) return null;
  return {
    script: [frontendApi, 'https://challenges.cloudflare.com'],
    connect: [frontendApi],
    img: ['https://img.clerk.com'],
    frame: ['https://challenges.cloudflare.com'],
  };
}
