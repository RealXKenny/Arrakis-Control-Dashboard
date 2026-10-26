import { expect, it } from 'vitest';
import { acquireApiCapacity } from '../../src/lib/api-capacity';

it('bounds concurrent work and releases each slot only once', () => {
  const release = acquireApiCapacity(1);
  expect(release).toBeTypeOf('function');
  expect(acquireApiCapacity(1)).toBeNull();
  release!();
  release!();
  const next = acquireApiCapacity(1);
  expect(next).toBeTypeOf('function');
  expect(acquireApiCapacity(1)).toBeNull();
  next!();
});
