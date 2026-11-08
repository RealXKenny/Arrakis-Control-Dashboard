import { expect, it } from 'vitest';
import { passphraseProblem } from '../../../src/features/admin/components/screens/backups-screen';

it('applies the Console passphrase rules before a system backup is requested', () => {
  expect(passphraseProblem('short')).toMatch(/12/);
  expect(passphraseProblem('aaaaaaaaaaaaaaaa')).toMatch(/different/);
  expect(passphraseProblem('x'.repeat(1025))).toMatch(/1,024/);
  expect(passphraseProblem('correct horse battery')).toBe('');
});
