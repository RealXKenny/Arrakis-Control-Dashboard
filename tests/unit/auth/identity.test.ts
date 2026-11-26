import { describe, expect, it, vi } from 'vitest';
import { discordAvatarUrl, navIdentity } from '../../../src/features/auth/identity';
import { loginSchema, safeNextPath, setPasswordSchema } from '../../../src/features/auth/schemas';

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));

describe('auth schemas', () => {
  it('normalises the login email and caps the password', () => {
    expect(loginSchema.parse({ email: '  Muad@Dib.TEST ', password: 'x' }).email).toBe('muad@dib.test');
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.test', password: 'x'.repeat(129) }).success).toBe(false);
  });

  it('requires a long, confirmed password', () => {
    expect(setPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' }).success).toBe(false);
    const mismatch = setPasswordSchema.safeParse({ password: 'a'.repeat(12), confirmPassword: 'b'.repeat(12) });
    expect(mismatch.success).toBe(false);
    expect(setPasswordSchema.safeParse({ password: 'a'.repeat(12), confirmPassword: 'a'.repeat(12) }).success).toBe(
      true,
    );
  });

  it.each(['//evil.test', 'https://evil.test', '/\\evil.test', 'portal', '/a\nb', 42, undefined])(
    'rejects unsafe redirect %j',
    (value) => expect(safeNextPath(value)).toBe('/portal'),
  );
  it('keeps same-site paths', () => expect(safeNextPath('/market?x=1')).toBe('/market?x=1'));
});

describe('nav identity', () => {
  const hash = 'a'.repeat(32);
  it('prefers the linked in-game name, then the Discord name', () => {
    const user = { id: '123', username: 'user', global_name: 'Global', avatar: hash };
    expect(navIdentity({ user, linkedPlayerName: 'Paul' }).ign).toBe('Paul');
    expect(navIdentity({ user }).ign).toBe('Global');
    expect(navIdentity({ user: { id: '123' } }).ign).toBe('Unknown');
  });
  it('builds only well-formed same-origin avatar URLs', () => {
    expect(discordAvatarUrl('123', hash)).toBe(`/api/v2/auth/avatar/123/${hash}`);
    expect(discordAvatarUrl('123', '../x')).toBeNull();
    expect(discordAvatarUrl('abc', hash)).toBeNull();
    expect(discordAvatarUrl('123', null)).toBeNull();
  });
});
