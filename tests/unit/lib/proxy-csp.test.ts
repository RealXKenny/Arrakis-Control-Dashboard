import { NextRequest } from 'next/server';
import { expect, it } from 'vitest';
import { proxy } from '../../../src/proxy';

it('issues a fresh script nonce per request without allowing arbitrary inline scripts', () => {
  const nonces = [1, 2].map(() => {
    const response = proxy(new NextRequest('http://127.0.0.1:2008/portal')) as Response;
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    const script = policy.split('; ').find((directive) => directive.startsWith('script-src ')) ?? '';
    const nonce = /'nonce-([A-Za-z0-9+/]{22}==)'/.exec(script)?.[1];
    expect(nonce).toBeDefined();
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'strict-dynamic'");
    // Next.js reads the forwarded request headers to attach the nonce to its own scripts.
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    return nonce;
  });
  expect(nonces[0]).not.toBe(nonces[1]);
});

it('allows no third-party script, connect or image origins beyond the Discord avatar CDN', () => {
  const response = proxy(new NextRequest('http://127.0.0.1:2008/portal')) as Response;
  const policy = response.headers.get('Content-Security-Policy') ?? '';
  expect(policy).not.toMatch(/announcify/i);
  const directive = (name: string) => policy.split('; ').find((entry) => entry.startsWith(name + ' ')) ?? '';
  expect(directive('script-src')).not.toMatch(/https:/);
  expect(directive('connect-src')).not.toMatch(/https:/);
  expect(directive('img-src').match(/https:\/\/[^ ]+/g)).toEqual(['https://cdn.discordapp.com']);
});
