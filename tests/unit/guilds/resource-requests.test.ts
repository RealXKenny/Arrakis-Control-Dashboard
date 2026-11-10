import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  resourceDraftSchema,
  resourceInputSchema,
  resourceProgress,
  resourceQuantitySchema,
  resourceRequestsView,
  type StoredResourceRequest,
} from '../../../src/features/guilds/resource-requests';

describe('guild resource request contracts', () => {
  it('keeps quantities exact above the safe-number range and rejects ambiguous input', () => {
    expect(resourceQuantitySchema.parse('900719925474099312')).toBe('900719925474099312');
    for (const quantity of ['0', '-1', '1.5', '1e6', '1,000', '01', '1000000000000000000', 100])
      expect(resourceQuantitySchema.safeParse(quantity).success).toBe(false);
    expect(
      resourceProgress({
        quantity: '900719925474099312',
        pledges: [
          { quantity: '900719925474099300', status: 'confirmed' },
          { quantity: '11', status: 'reported' },
        ],
      }),
    ).toEqual({ committed: '900719925474099311', delivered: '900719925474099300', unpledged: '1' });
  });
  it('accepts bounded request details and does not accept caller identity on any action', () => {
    const id = randomUUID();
    const revision = randomUUID();
    expect(
      resourceDraftSchema.safeParse({
        id,
        material: 'Steel ingots',
        quantity: '100',
        unit: 'ingots',
        dropoff: 'Guild base',
        details: '',
        priority: 'normal',
      }).success,
    ).toBe(true);
    for (const action of ['pledge', 'report', 'withdraw']) {
      const input = { action, id, revision, ...(action === 'pledge' ? { quantity: '10' } : {}) };
      expect(resourceInputSchema.safeParse(input).success).toBe(true);
      expect(resourceInputSchema.safeParse({ ...input, supplierId: 'forged' }).success).toBe(false);
    }
  });
  it('redacts requester, supplier and confirmer IDs and derives viewer-relative flags', () => {
    const request: StoredResourceRequest = {
      id: randomUUID(),
      revision: randomUUID(),
      material: 'Steel',
      quantity: '20',
      unit: 'ingots',
      dropoff: 'Base',
      details: '',
      priority: 'normal',
      status: 'open',
      requesterId: 'private-requester',
      requesterName: 'Requester',
      createdAt: '2026-11-10T12:00:00.000Z',
      updatedAt: '2026-11-10T12:00:00.000Z',
      pledges: [
        {
          id: randomUUID(),
          supplierId: 'private-supplier',
          name: 'Supplier',
          quantity: '10',
          status: 'confirmed',
          promisedAt: '2026-11-10T12:00:00.000Z',
          reportedAt: '2026-11-10T12:00:00.000Z',
          confirmedAt: '2026-11-10T12:00:00.000Z',
          confirmedById: 'private-confirmer',
          confirmedByName: 'Leader',
        },
      ],
    };
    const supplier = resourceRequestsView([request], 'private-supplier', false);
    expect(supplier.requests[0].isRequester).toBe(false);
    expect(supplier.requests[0].pledges[0].isSelf).toBe(true);
    expect(resourceRequestsView([request], 'private-requester', false).requests[0].isRequester).toBe(true);
    expect(JSON.stringify(supplier)).not.toMatch(/private-|requesterId|supplierId|confirmedById/);
  });
});
