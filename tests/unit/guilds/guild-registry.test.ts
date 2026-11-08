import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request }) }));

beforeEach(async () => {
  request.mockReset();
  const { clearGuildRegistryForTests } = await import('../../../src/features/guilds/server/guild-registry');
  clearGuildRegistryForTests();
});

describe('authoritative guild names', () => {
  it('reads names by guild ID across pages and tolerates the provider row shapes', async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ guild_id: `g${index}`, guild_name: `Guild ${index}` }));
    request
      .mockResolvedValueOnce({ rows: full })
      .mockResolvedValueOnce({ data: [{ id: 777, name: ' Late Guild ' }, { id: 'x' }] });
    const { authoritativeGuildName } = await import('../../../src/features/guilds/server/guild-registry');
    expect(await authoritativeGuildName('g42')).toBe('Guild 42');
    expect(await authoritativeGuildName('777')).toBe('Late Guild');
    expect(await authoritativeGuildName('missing')).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('falls back to the stored name for display only when the Console is unreachable', async () => {
    request.mockRejectedValue(new Error('down'));
    const { authoritativeGuildName, displayGuildName } =
      await import('../../../src/features/guilds/server/guild-registry');
    await expect(authoritativeGuildName('1')).rejects.toThrow();
    expect(await displayGuildName('1', 'Stored')).toBe('Stored');
  });

  it('shows the Console name for listings saved before names were verified', async () => {
    request.mockResolvedValue({ rows: [{ guild_id: '1', guild_name: 'Real Name' }] });
    const { displayGuildName } = await import('../../../src/features/guilds/server/guild-registry');
    expect(await displayGuildName('1', 'Impostor Name')).toBe('Real Name');
  });
});
