import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => createElement('a', { href }, children as never),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));

describe('screens that depend on the Discord adapter', () => {
  it('the Discord screen says plainly that the adapter is not configured', async () => {
    const { default: DiscordScreen } = await import('../../../src/features/admin/components/screens/discord-screen');
    const html = renderToStaticMarkup(
      createElement(DiscordScreen, { operations: [], adapterConfigured: false, consoleOrigin: null }),
    );
    expect(html).toContain('The Discord adapter is not configured');
    expect(html).not.toContain('<form');
  });
});
