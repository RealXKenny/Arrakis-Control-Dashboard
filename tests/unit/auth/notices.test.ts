import { describe, expect, it } from 'vitest';
import { signInNotice } from '../../../src/features/auth/notices';

describe('sign-in notices', () => {
  it('maps known codes and falls back to generic text for anything else', () => {
    expect(signInNotice('role')).toContain('guild role');
    expect(signInNotice('anything-else')).toBe('Sign-in failed. Please try again.');
    expect(signInNotice(undefined)).toBeUndefined();
    expect(signInNotice('')).toBeUndefined();
  });

  it('never returns inherited object members for crafted codes', () => {
    for (const code of ['constructor', '__proto__', 'toString', 'hasOwnProperty'])
      expect(signInNotice(code)).toBe('Sign-in failed. Please try again.');
  });
});
