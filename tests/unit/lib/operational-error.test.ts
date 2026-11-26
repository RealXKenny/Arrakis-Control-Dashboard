import { describe, expect, it } from 'vitest';
import { describeOperationalError } from '../../../src/lib/errors';
import { unavailableError } from '../../../src/lib/redis/client';

describe('describeOperationalError', () => {
  it('keeps the socket error code and message', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6379'), { code: 'ECONNREFUSED' });
    expect(describeOperationalError(error)).toBe('connect ECONNREFUSED 10.0.0.5:6379');
  });

  it('prefixes a code the message does not already mention', () => {
    const error = Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' });
    expect(describeOperationalError(error)).toBe('ETIMEDOUT: connection timed out');
  });

  it('scrubs connection strings with credentials', () => {
    const reason = describeOperationalError(new Error('failed to reach rediss://user:hunter2@cache.example:6380/0'));
    expect(reason).not.toContain('hunter2');
    expect(reason).toContain('[redacted-url]');
  });

  it('ignores unsafe codes and non-errors', () => {
    const error = Object.assign(new Error('boom'), { code: 'not a code; drop table' });
    expect(describeOperationalError(error)).toBe('boom');
    expect(describeOperationalError('nope')).toBe('unknown error');
    expect(describeOperationalError(new Error('x'.repeat(500)))).toHaveLength(200);
  });
});

describe('unavailableError', () => {
  it('names the last connection failure', () => {
    const cause = Object.assign(new Error('WRONGPASS invalid username-password pair'), { code: 'WRONGPASS' });
    const error = unavailableError(cause);
    expect(error.message).toBe('Redis is unavailable: WRONGPASS invalid username-password pair');
    expect(error.cause).toBe(cause);
    expect(unavailableError(undefined).message).toBe('Redis is unavailable.');
  });
});
