import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  operationDraftSchema,
  operationInputSchema,
  operationsView,
  type OperationDraft,
  type StoredOperation,
} from '../../../src/features/guilds/operations';

const draft = (): OperationDraft => ({
  id: randomUUID(),
  title: 'Desert patrol',
  kind: 'deep-desert',
  details: '',
  meetingPoint: 'Guild base',
  startsAt: '2027-01-02T15:00:00.000Z',
  endsAt: '2027-01-02T17:00:00.000Z',
  roles: [{ role: 'pilot', capacity: 1 }],
});
describe('guild operation contracts', () => {
  it('accepts bounded schedules and rejects backwards or oversized durations', () => {
    expect(operationDraftSchema.safeParse(draft()).success).toBe(true);
    for (const endsAt of ['2027-01-02T14:00:00.000Z', '2027-01-04T15:00:00.000Z', 'invalid'])
      expect(operationDraftSchema.safeParse({ ...draft(), endsAt }).success).toBe(false);
  });
  it('requires distinct roles with 1–50 slots total', () => {
    for (const roles of [
      [],
      [{ role: 'pilot', capacity: 0 }],
      [{ role: 'pilot', capacity: 51 }],
      [
        { role: 'pilot', capacity: 1 },
        { role: 'pilot', capacity: 2 },
      ],
      [
        { role: 'pilot', capacity: 30 },
        { role: 'scout', capacity: 30 },
      ],
    ])
      expect(operationDraftSchema.safeParse({ ...draft(), roles }).success).toBe(false);
  });
  it('does not accept caller-provided signup identity or permissions', () => {
    const input = { action: 'join', id: randomUUID(), revision: randomUUID(), role: 'pilot' };
    expect(operationInputSchema.safeParse(input).success).toBe(true);
    for (const extra of [{ memberId: 'other' }, { name: 'Leader' }, { canEdit: true }])
      expect(operationInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  });
  it('redacts Console IDs and derives each viewer own-signup flag', () => {
    const operation: StoredOperation = {
      ...draft(),
      revision: randomUUID(),
      status: 'scheduled',
      organizerName: 'Leader',
      createdAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2027-01-01T00:00:00.000Z',
      signups: [
        {
          id: randomUUID(),
          name: 'Scout',
          memberId: 'private-console-id',
          role: 'pilot',
          signedUpAt: '2027-01-01T00:00:00.000Z',
        },
      ],
    };
    const own = operationsView([operation], 'private-console-id', false);
    expect(own.operations[0].signups[0].isSelf).toBe(true);
    expect(operationsView([operation], 'another-member', false).operations[0].signups[0].isSelf).toBe(false);
    expect(JSON.stringify(own)).not.toContain('private-console-id');
    expect(JSON.stringify(own)).not.toContain('memberId');
  });
});
