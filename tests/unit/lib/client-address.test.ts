import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ TRUSTED_PROXY_COUNT: 1 as number | undefined }));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'production', ...env }) }));

import { getClientAddress } from '../../../src/lib/security/rate-limit';

const socket = { remoteAddress: '10.0.0.5' };

beforeEach(() => {
  env.TRUSTED_PROXY_COUNT = 1;
});

describe('client address behind a reverse proxy', () => {
  it('trusts only the entry the proxy appended, never one the client supplied', () => {
    // The caller forged "1.1.1.1"; the proxy appended the real address 203.0.113.9.
    expect(getClientAddress({ headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }, socket })).toBe('203.0.113.9');
    // Rotating the forged prefix changes nothing: the bucket stays the real client's.
    expect(getClientAddress({ headers: { 'x-forwarded-for': '8.8.8.8, 9.9.9.9, 203.0.113.9' }, socket })).toBe(
      '203.0.113.9',
    );
  });

  it('counts proxies from the right when several are configured', () => {
    env.TRUSTED_PROXY_COUNT = 2;
    expect(getClientAddress({ headers: { 'x-forwarded-for': 'forged, 203.0.113.9, 10.1.1.1' }, socket })).toBe(
      '203.0.113.9',
    );
  });

  it('ignores the header entirely when no proxy is trusted', () => {
    env.TRUSTED_PROXY_COUNT = 0;
    expect(getClientAddress({ headers: { 'x-forwarded-for': '1.1.1.1' }, socket })).toBe('10.0.0.5');
  });

  it('falls back to the connection address for a missing, short or malformed header', () => {
    expect(getClientAddress({ headers: {}, socket })).toBe('10.0.0.5');
    env.TRUSTED_PROXY_COUNT = 3;
    expect(getClientAddress({ headers: { 'x-forwarded-for': '203.0.113.9' }, socket })).toBe('10.0.0.5');
    env.TRUSTED_PROXY_COUNT = 1;
    expect(getClientAddress({ headers: { 'x-forwarded-for': 'not-an-ip' }, socket })).toBe('10.0.0.5');
    expect(getClientAddress({ headers: { 'x-forwarded-for': 'not-an-ip' } })).toBe('unknown');
  });

  it('defaults to one trusted proxy when the setting is absent', () => {
    env.TRUSTED_PROXY_COUNT = undefined;
    expect(getClientAddress({ headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }, socket })).toBe('203.0.113.9');
  });
});
