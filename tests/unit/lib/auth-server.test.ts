import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/lib/env', () => ({
  requireServerEnv: () => ({ AUTH_SECRET: 'test-secret-test-secret-test-secret-1234' }),
  getServerEnv: () => ({}),
}));

beforeEach(() => vi.resetModules());

it('hashes passwords with scrypt and verifies only the right one', async () => {
  const { hashPassword, verifyPassword } = await import('../../../src/server/auth/password');
  const hash = await hashPassword('correct horse battery');
  expect(hash).toMatch(/^scrypt\$/);
  expect(hash).not.toContain('correct horse');
  expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  expect(await verifyPassword('wrong password here', hash)).toBe(false);
});

it('never accepts a password for an unknown account', async () => {
  const { verifyPassword } = await import('../../../src/server/auth/password');
  expect(await verifyPassword('anything', undefined)).toBe(false);
});

it('seals the Discord refresh token and rejects tampering', async () => {
  const { sealSecret, openSecret } = await import('../../../src/server/auth/password');
  const sealed = sealSecret('refresh-token');
  expect(sealed).not.toContain('refresh-token');
  expect(openSecret(sealed)).toBe('refresh-token');
  const [iv, tag, body] = sealed.split('.');
  const flipped = Buffer.from(body, 'base64');
  flipped[0] ^= 1;
  expect(openSecret([iv, tag, flipped.toString('base64')].join('.'))).toBeNull();
  expect(openSecret('garbage')).toBeNull();
});

it('lets only one Discord account claim an email', async () => {
  const { claimEmail } = await import('../../../src/server/auth/users');
  expect(await claimEmail('111', 'shared@dune.test')).toBe(true);
  expect(await claimEmail('111', 'shared@dune.test')).toBe(true);
  expect(await claimEmail('222', 'shared@dune.test')).toBe(false);
});
