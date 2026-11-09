import { existsSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => vi.fn());
vi.mock('../../../src/features/auth/server/session', () => ({ currentSession: session }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { href, ...rest }, children as never),
}));

import { CAPABILITIES, FEATURED, FINAL, HERO, OPERATOR, PILLARS } from '../../../src/features/landing/content';

async function render(member: unknown = null) {
  session.mockResolvedValue(member);
  const { default: LandingPage } = await import('../../../src/features/landing/components/landing-page');
  return renderToStaticMarkup(await LandingPage());
}

const links = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs)].map((m) => ({
    href: m[1]!,
    text: m[2]!.replace(/<[^>]+>/g, '').trim(),
  }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** A route exists when the App Router has a page for it. */
function routeExists(href: string) {
  const root = path.join(process.cwd(), 'src', 'app');
  const clean = href.split('#')[0]!.replace(/^\//, '');
  return [path.join(root, clean, 'page.tsx'), path.join(root, '(workspace)', clean, 'page.tsx')].some(existsSync);
}

beforeEach(() => {
  session.mockReset();
});

describe('hero', () => {
  it('names the product and says what it is, in the words of the repository positioning', async () => {
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>.*Arrakis.*Control.*<\/h1>/s);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(text(html)).toContain(
      'A modern command center for Dune: Awakening servers, players, guilds, and communities.',
    );
    expect(HERO.headline.join(' ')).toBe('Arrakis Control');
  });

  it('signed out: the primary call to action is the existing Discord sign-in, and the secondary scrolls to the features', async () => {
    const html = await render(null);
    const all = links(html);
    expect(all.filter((link) => link.text === 'Sign in with Discord').map((link) => link.href)).toEqual([
      '/login',
      '/login',
    ]);
    expect(all.some((link) => link.text === 'Open dashboard')).toBe(false);
    expect(all.find((link) => link.text === 'Explore features')?.href).toBe('#features');
    expect(html).toContain('id="features"');
  });

  it('signed in: the primary call to action opens the dashboard, and nothing asks them to sign in', async () => {
    const html = await render({ user: { id: '4242', username: 'private-name' }, guildId: 'g', roleIds: ['r'] });
    const all = links(html);
    expect(all.filter((link) => link.text === 'Open dashboard').map((link) => link.href)).toEqual([
      '/portal',
      '/portal',
    ]);
    expect(all.filter((link) => /sign in/i.test(link.text))).toEqual([]);
    expect(text(html)).toContain(FINAL.signedIn.title);
  });

  it('treats a failing session lookup as signed out, so a storage problem cannot take the public page down', async () => {
    session.mockRejectedValue(new Error('redis down'));
    const { default: LandingPage } = await import('../../../src/features/landing/components/landing-page');
    expect(links(renderToStaticMarkup(await LandingPage())).some((link) => link.text === 'Sign in with Discord')).toBe(
      true,
    );
  });
});

describe('links', () => {
  it('every link on the page points at a route that exists, or at an anchor on the page', async () => {
    for (const member of [null, { user: { id: '1' } }]) {
      const html = await render(member);
      for (const { href } of links(html)) {
        if (href.startsWith('#')) expect(html, href).toContain(`id="${href.slice(1)}"`);
        else expect(routeExists(href), href).toBe(true);
      }
    }
  });

  it('every featured capability links to a real page, and no link is a bare placeholder', () => {
    for (const item of [...FEATURED, ...CAPABILITIES]) {
      expect(item.href, item.title).toMatch(/^\/[a-z]/);
      expect(routeExists(item.href), item.href).toBe(true);
    }
    expect(new Set([...FEATURED, ...CAPABILITIES].map((item) => item.href)).size).toBe(
      FEATURED.length + CAPABILITIES.length,
    );
  });

  it('never links to administration', async () => {
    expect(await render({ user: { id: '1' } })).not.toContain('href="/admin');
  });
});

describe('content is accurate and current', () => {
  it('has no obsolete, retired or invented claims', async () => {
    const copy = text(await render()).toLowerCase();
    for (const phrase of [
      'deep desert command',
      'command the',
      'everything the landsraad would hide',
      'the spice must flow',
      'join the sietch',
      'new in v2',
      'changelog broadcasts',
      'interactive link embeds',
      'strict 5 by 5',
      'sandworm activity',
      'console preview',
      'illustrative',
      '03 bases',
      '07 vehicles',
      '25 listings',
      'demo credits',
      'play money',
    ])
      expect(copy, phrase).not.toContain(phrase);
  });

  it('contains no statistics, counts, testimonials or sample figures', async () => {
    const copy = text(await render());
    expect(copy).not.toMatch(
      /\b\d[\d,.]*\s*(\+|k|m|%|players|users|members|servers|guilds|bases|listings|vehicles)\b/i,
    );
    expect(copy.toLowerCase()).not.toMatch(/testimonial|trusted by|rated|stars/);
  });

  it('describes the casino honestly: real Solaris, closed by default, never a demo', () => {
    const casino = CAPABILITIES.find((item) => item.id === 'casino')!;
    expect(casino.summary).toContain('real in-game Solaris');
    expect(casino.note).toMatch(/closed by default/i);
    expect(casino.summary.toLowerCase()).not.toMatch(/demo|free|win big|jackpot/);
  });

  it('marks Live Chat as optional and leaves out features that are not released', () => {
    expect(CAPABILITIES.find((item) => item.id === 'chat')?.note).toMatch(/optional/i);
    const everything = JSON.stringify({ FEATURED, CAPABILITIES, PILLARS, OPERATOR, HERO }).toLowerCase();
    for (const unreleased of ['community events', 'service status', 'coming soon', 'planned', 'roadmap'])
      expect(everything, unreleased).not.toContain(unreleased);
  });

  it('keeps the dashboard’s own names for its pages', () => {
    const titles = CAPABILITIES.map((item) => item.title);
    expect(titles).toEqual(expect.arrayContaining(['Base Marketplace', 'Live Chat', 'The Solaris Exchange']));
  });
});

describe('public rendering', () => {
  it('exposes nothing about the signed-in member', async () => {
    const html = await render({
      user: { id: '9876543210', username: 'secret-handle', global_name: 'Secret Name', avatar: 'abcdef' },
      guildId: 'guild-xyz',
      roleIds: ['role-123'],
      linkedPlayerName: 'Hidden Character',
    });
    for (const secret of [
      '9876543210',
      'secret-handle',
      'Secret Name',
      'abcdef',
      'guild-xyz',
      'role-123',
      'Hidden Character',
    ])
      expect(html, secret).not.toContain(secret);
  });

  it('hides decorative illustrations from assistive technology and captions them as illustrations', async () => {
    const html = await render();
    expect((html.match(/<figure/g) ?? []).length).toBe(3);
    expect((html.match(/Illustration of the layout\. It shows no real data\./g) ?? []).length).toBe(3);
    for (const figure of html.match(/<figure.*?<\/figure>/gs) ?? []) expect(figure).toContain('aria-hidden="true"');
  });

  it('has one landmark per section, each named by a heading', async () => {
    const html = await render();
    const sections = html.match(/<section[^>]*aria-labelledby="([^"]+)"/g) ?? [];
    expect(sections.length).toBeGreaterThanOrEqual(5);
    for (const [, id] of [...html.matchAll(/<section[^>]*aria-labelledby="([^"]+)"/g)])
      expect(html).toContain(`id="${id}"`);
  });
});
