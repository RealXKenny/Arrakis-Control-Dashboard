import { describe, expect, it } from 'vitest';
import { guildRoleLabel } from '../../src/modules/portal/utils/guild';

describe('guild role labels', () => {
  it('maps known role IDs', () => {
    expect(guildRoleLabel(1)).toBe('Member');
    expect(guildRoleLabel('50')).toBe('Officer');
    expect(guildRoleLabel(100)).toBe('Leader');
  });

  it('keeps unknown and missing roles explicit', () => {
    expect(guildRoleLabel(75)).toBe('Role 75');
    expect(guildRoleLabel(null)).toBe('Not reported');
  });
});
