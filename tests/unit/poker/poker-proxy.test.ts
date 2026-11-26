import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '../../../src/proxy';

const directive = (response: Response, name: string) =>
  (response.headers.get('Content-Security-Policy') ?? '').split('; ').find((entry) => entry.startsWith(name + ' ')) ??
  '';
const LAUNCH = 'http://127.0.0.1:2008/?frame_id=f1&instance_id=i-live&platform=desktop';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('poker Activity framing', () => {
  it('lets only Discord frame the Activity and rewrites the launch URL while enabled', () => {
    vi.stubEnv('POKER_ACTIVITY_ENABLED', 'true');
    for (const url of [LAUNCH, 'http://127.0.0.1:2008/activity/poker']) {
      const response = proxy(new NextRequest(url));
      expect(directive(response, 'frame-ancestors')).toBe(
        'frame-ancestors https://discord.com https://ptb.discord.com https://canary.discord.com',
      );
      expect(response.headers.get('X-Frame-Options')).toBeNull();
      expect(response.headers.get('x-middleware-request-x-arrakis-surface')).toBe('activity');
      expect(directive(response, 'script-src')).not.toMatch(/https:/);
      expect(directive(response, 'connect-src')).not.toMatch(/https:/);
    }
    const rewritten = proxy(new NextRequest(LAUNCH));
    expect(new URL(rewritten.headers.get('x-middleware-rewrite') ?? '').pathname).toBe('/activity/poker');
  });

  it('keeps every other page unframeable and ignores a forged surface header', () => {
    vi.stubEnv('POKER_ACTIVITY_ENABLED', 'true');
    for (const url of [
      'http://127.0.0.1:2008/',
      'http://127.0.0.1:2008/portal?frame_id=f1&instance_id=i',
      'http://127.0.0.1:2008/activity/poker/x',
    ]) {
      const response = proxy(new NextRequest(url, { headers: { 'x-arrakis-surface': 'activity' } }));
      expect(directive(response, 'frame-ancestors')).toBe("frame-ancestors 'none'");
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('x-middleware-request-x-arrakis-surface')).toBe('site');
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    }
  });

  it('frames nothing while the Activity is disabled', () => {
    vi.stubEnv('POKER_ACTIVITY_ENABLED', 'false');
    for (const url of [LAUNCH, 'http://127.0.0.1:2008/activity/poker']) {
      const response = proxy(new NextRequest(url));
      expect(directive(response, 'frame-ancestors')).toBe("frame-ancestors 'none'");
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    }
  });
});
