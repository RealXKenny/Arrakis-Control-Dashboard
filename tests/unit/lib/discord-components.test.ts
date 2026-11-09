import { describe, expect, it } from 'vitest';
import { discordContainer, type DiscordLinkButton } from '../../../src/lib/discord-components';

describe('Discord Components V2 layout', () => {
  it('separates display blocks inside a container and keeps button rows inside it', () => {
    const button: DiscordLinkButton = { type: 2, style: 5, label: 'View event', url: 'https://dashboard.test/events' };
    const payload = discordContainer(['# Community event', '## Prizes\n500,000 Solaris'], [button]);
    expect(payload.flags).toBe(1 << 15);
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('embeds');
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.components[0].components.map((component) => component.type)).toEqual([10, 14, 10, 14, 1]);
  });

  it('bounds total text across all displays and total nested components', () => {
    const buttons: DiscordLinkButton[] = Array.from({ length: 5 }, (_, index) => ({
      type: 2,
      style: 5,
      label: `Button ${index}`,
      url: 'https://dashboard.test',
    }));
    for (const blocks of [Array(40).fill('Short section'), Array(40).fill('x'.repeat(1000))]) {
      const payload = discordContainer(blocks, buttons);
      const children = payload.components[0].components;
      const text = children
        .filter((child) => child.type === 10)
        .map((child) => child.content)
        .join('');
      const count = 1 + children.reduce((sum, child) => sum + 1 + (child.type === 1 ? child.components.length : 0), 0);
      expect(text.length).toBeLessThan(4000);
      expect(count).toBeLessThanOrEqual(40);
      expect(text).toContain('…');
    }
  });
});
