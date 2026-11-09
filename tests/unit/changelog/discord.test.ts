import { describe, expect, it } from 'vitest';
import {
  announcementInputSchema,
  buildAnnouncementPayloads,
  parseProgressLines,
  progressBar,
} from '../../../src/features/changelog/discord';
import type { DiscordContainerPayload } from '../../../src/lib/discord-components';
const APP = 'https://portal.example.com/';
const base = { kind: 'release' as const, version: '2.0.0', headline: '', note: '', progress: [], buttons: [] };
const input = () => announcementInputSchema.parse(base);
const release = {
  version: '2.0.0',
  date: '',
  sections: [
    { title: 'New Features', items: ['A complete new feature', 'Another complete feature'] },
    { title: 'Security', items: ['Preserve authorization checks'] },
  ],
};
const text = (payload: DiscordContainerPayload) =>
  payload.components[0].components
    .filter((row) => row.type === 10)
    .map((row) => row.content)
    .join('\n');

describe('complete multipart Discord changelogs', () => {
  it('uses one V2 container for a small release, with safe links and no mentions', () => {
    const pages = buildAnnouncementPayloads(input(), { appUrl: APP, release });
    expect(pages).toHaveLength(1);
    expect(pages[0].flags).toBe(32768);
    expect(pages[0]).not.toHaveProperty('content');
    expect(pages[0]).not.toHaveProperty('embeds');
    expect(pages[0].allowed_mentions).toEqual({ parse: [] });
    expect(text(pages[0])).toContain('- A complete new feature');
    expect(text(pages[0])).toContain('## Security');
    const buttons = pages[0].components[0].components.filter((row) => row.type === 1).flatMap((row) => row.components);
    expect(buttons.map((button) => button.label)).toEqual(['View changelog', 'Open dashboard']);
    expect(buttons[0].url).toBe('https://portal.example.com/changelog#v2.0.0');
  });

  it('preserves every complete note and category across numbered messages without clipping', () => {
    const large = {
      ...release,
      sections: Array.from({ length: 8 }, (_, section) => ({
        title: `Category ${section}`,
        items: Array.from({ length: 25 }, (_, item) => `Unique note ${section}/${item}: ${'full content '.repeat(25)}`),
      })),
    };
    const pages = buildAnnouncementPayloads(input(), { appUrl: APP, release: large });
    expect(pages.length).toBeGreaterThan(1);
    const combined = pages.map(text).join('\n');
    for (const section of large.sections) {
      expect(combined).toContain(`## ${section.title}`);
      for (const item of section.items) expect(combined).toContain(item);
    }
    expect(combined).not.toContain('…');
    pages.forEach((page, index) => {
      expect(text(page)).toContain(`Part ${index + 1} of ${pages.length}`);
      expect(text(page).replaceAll('\n', '').length).toBeLessThan(4000);
      const children = page.components[0].components;
      expect(
        1 + children.reduce((sum, child) => sum + 1 + (child.type === 1 ? child.components.length : 0), 0),
      ).toBeLessThanOrEqual(40);
    });
  });

  it('splits oversized individual notes without losing text or breaking surrogate pairs', () => {
    const pages = buildAnnouncementPayloads(input(), {
      release: { ...release, sections: [{ title: 'Long note', items: ['Z'.repeat(9000) + '🚀'.repeat(500)] }] },
    });
    const combined = pages.map(text).join('');
    expect(combined.match(/Z/g)).toHaveLength(9000);
    expect(combined.match(/🚀/gu)).toHaveLength(500);
    for (const page of pages) expect(text(page).length).toBeLessThan(4000);
  });

  it('rejects excessive series before sending instead of silently dropping notes', () => {
    expect(() =>
      buildAnnouncementPayloads(input(), {
        release: { ...release, sections: [{ title: 'Too large', items: Array(100).fill('x'.repeat(2800)) }] },
      }),
    ).toThrow('50 messages');
    expect(() => buildAnnouncementPayloads(input(), {})).toThrow('2.0.0');
  });

  it('omits local development links', () => {
    const pages = buildAnnouncementPayloads(input(), { appUrl: 'http://localhost:2008', release });
    expect(JSON.stringify(pages)).not.toContain('localhost');
  });

  it('retains progress summaries, full checklists, and notes', () => {
    const progress = parseProgressLines('[x] Done\n[~] Active\n[ ] Next\nPlain line');
    expect(progressBar(progress)).toMatchObject({ percent: 25, done: 1 });
    const pages = buildAnnouncementPayloads(
      announcementInputSchema.parse({ ...base, kind: 'progress', progress, note: 'Keep this whole note' }),
      { appUrl: APP },
    );
    const combined = pages.map(text).join('');
    for (const expected of ['in progress', '✅ Done', '🔧 Active', '**25%**', 'Keep this whole note'])
      expect(combined).toContain(expected);
  });

  it('validates links, versions, button counts and checklist lengths', () => {
    for (const url of ['http://example.com', 'javascript:alert(1)', 'https://u:p@example.com', 'nope'])
      expect(announcementInputSchema.safeParse({ ...base, buttons: [{ label: 'Link', url }] }).success).toBe(false);
    expect(announcementInputSchema.safeParse({ ...base, version: 'bad version!' }).success).toBe(false);
    expect(
      announcementInputSchema.safeParse({ ...base, buttons: Array(4).fill({ label: 'Link', url: APP }) }).success,
    ).toBe(false);
    expect(
      announcementInputSchema.safeParse({ ...base, progress: Array(16).fill({ label: 'x', state: 'todo' }) }).success,
    ).toBe(false);
  });
});
