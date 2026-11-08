import { beforeEach, describe, expect, it, vi } from 'vitest';

const limiter = vi.hoisted(() => ({
  result: { allowed: true, remaining: 1, retryAfter: 1 } as Record<string, unknown>,
}));

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/server/http', () => ({ requireApiSession: vi.fn() }));
vi.mock('../../../src/features/admin/server/access', () => ({ isDashboardAdmin: vi.fn() }));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: vi.fn(async () => limiter.result) }));

const session = { user: { id: '1' } } as never;

beforeEach(() => {
  limiter.result = { allowed: true, remaining: 1, retryAfter: 1 };
});

describe('administrator operation budget', () => {
  it('allows operations inside the budget', async () => {
    const { spendAdminBudget } = await import('../../../src/features/admin/server/api-access');
    await expect(spendAdminBudget(session)).resolves.toBeUndefined();
  });

  it('refuses operations over the budget with 429', async () => {
    limiter.result = { allowed: false, remaining: 0, retryAfter: 12 };
    const { spendAdminBudget } = await import('../../../src/features/admin/server/api-access');
    await expect(spendAdminBudget(session)).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
  });

  it('fails closed when limiter storage is unavailable', async () => {
    limiter.result = { allowed: false, remaining: 0, retryAfter: 5, storageUnavailable: true };
    const { spendAdminBudget } = await import('../../../src/features/admin/server/api-access');
    await expect(spendAdminBudget(session)).rejects.toMatchObject({ statusCode: 503 });
  });
});
