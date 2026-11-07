import { describe, expect, it } from 'vitest';
import {
  EMBED_LIMITS,
  announcementInputSchema,
  buildWebhookPayload,
  parseProgressLines,
  progressBar,
} from '../../../src/features/changelog/discord';
import { isDiscordWebhookUrl } from '../../../src/lib/discord-webhook-url';

const APP = 'https://portal.example.com/';
const release = {
  version: '1.2.3',
  date: '2026-11-07',
  sections: [
    { title: 'Added', items: ['A `thing`', 'Another thing'] },
    { title: 'Fixed', items: ['A bug'] },
  ],
};
const base = { headline: '', note: '', progress: [], buttons: [] };

describe('Discord webhook URL allowlist', () => {
  const token = 'a'.repeat(40);
  it('accepts real webhook URLs only', () => {
    expect(isDiscordWebhookUrl(`https://discord.com/api/webhooks/123456789012345678/${token}`)).toBe(true);
    expect(isDiscordWebhookUrl(`https://discord.com/api/v10/webhooks/123456789012345678/${token}`)).toBe(true);
    for (const bad of [
      `http://discord.com/api/webhooks/123456789012345678/${token}`,
      `https://discord.com.evil.test/api/webhooks/123456789012345678/${token}`,
      `https://evil.test/api/webhooks/123456789012345678/${token}`,
      `https://user:pw@discord.com/api/webhooks/123456789012345678/${token}`,
      `https://discord.com/api/webhooks/123456789012345678/${token}?x=1`,
      'https://discord.com/api/webhooks/1/2',
      'not a url',
    ]) {
      expect(isDiscordWebhookUrl(bad), bad).toBe(false);
    }
  });
});

describe('release announcements', () => {
  const payload = buildWebhookPayload(announcementInputSchema.parse({ ...base, kind: 'release', version: '1.2.3' }), {
    appUrl: APP,
    release,
    now: new Date(0),
  });

  it('builds an embed with link buttons that point at the changelog', () => {
    const embed = payload.embeds[0];
    expect(embed.title).toBe('Arrakis Control v1.2.3');
    expect(embed.url).toBe('https://portal.example.com/changelog#v1.2.3');
    expect(embed.fields?.map((field) => field.name)).toEqual(['Added', 'Fixed']);
    const buttons = payload.components[0].components;
    expect(buttons.map((button) => button.label)).toEqual(['View changelog', 'Open dashboard']);
    expect(buttons.every((button) => button.style === 5 && button.url.startsWith('https://'))).toBe(true);
  });

  it('can never ping anyone', () => {
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });

  it('fails clearly when the release does not exist', () => {
    expect(() =>
      buildWebhookPayload(announcementInputSchema.parse({ ...base, kind: 'release', version: '9.9.9' }), {
        appUrl: APP,
      }),
    ).toThrow(/9\.9\.9/);
  });

  it('stays inside Discord size limits however large the changelog is', () => {
    const huge = {
      ...release,
      sections: Array.from({ length: 40 }, (_, i) => ({
        title: `Section ${i} ${'x'.repeat(400)}`,
        items: Array.from({ length: 30 }, () => 'y'.repeat(500)),
      })),
    };
    const embed = buildWebhookPayload(announcementInputSchema.parse({ ...base, kind: 'release', version: '1.2.3' }), {
      appUrl: APP,
      release: huge,
    }).embeds[0];
    const total =
      embed.title.length +
      (embed.description?.length ?? 0) +
      embed.footer.text.length +
      (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
    expect(total).toBeLessThanOrEqual(6000);
    expect(embed.fields!.length).toBeLessThanOrEqual(EMBED_LIMITS.fields);
    expect(embed.fields!.every((f) => f.name.length <= 256 && f.value.length <= 1024)).toBe(true);
    expect(embed.fields!.at(-1)?.name).toBe('And more');
  });
});

describe('progress announcements', () => {
  it('parses the checklist syntax', () => {
    expect(parseProgressLines('[x] Done thing\n- [~] Doing thing\n[ ] Todo thing\nPlain line\n\n')).toEqual([
      { label: 'Done thing', state: 'done' },
      { label: 'Doing thing', state: 'active' },
      { label: 'Todo thing', state: 'todo' },
      { label: 'Plain line', state: 'todo' },
    ]);
  });

  it('renders a progress bar and checklist', () => {
    const progress = parseProgressLines('[x] a\n[x] b\n[~] c\n[ ] d');
    expect(progressBar(progress)).toMatchObject({ percent: 50, done: 2 });
    const embed = buildWebhookPayload(
      announcementInputSchema.parse({ ...base, kind: 'progress', version: '2.0.0', progress }),
      { appUrl: APP },
    ).embeds[0];
    expect(embed.title).toBe('Arrakis Control v2.0.0 in progress');
    expect(embed.description).toContain('✅ a');
    expect(embed.description).toContain('🔧 c');
    expect(embed.description).toContain('**50%**');
  });
});

describe('announcement input validation', () => {
  const ok = { ...base, kind: 'progress', version: '2.0.0' };
  it('rejects non-https and credentialed button links', () => {
    for (const url of ['http://example.com', 'javascript:alert(1)', 'https://u:p@example.com', 'nope']) {
      expect(announcementInputSchema.safeParse({ ...ok, buttons: [{ label: 'x', url }] }).success, url).toBe(false);
    }
    expect(
      announcementInputSchema.safeParse({ ...ok, buttons: [{ label: 'x', url: 'https://example.com/a' }] }).success,
    ).toBe(true);
  });

  it('bounds versions, buttons and checklist size', () => {
    expect(announcementInputSchema.safeParse({ ...ok, version: 'bad version!' }).success).toBe(false);
    const button = { label: 'x', url: 'https://example.com' };
    expect(announcementInputSchema.safeParse({ ...ok, buttons: [button, button, button, button] }).success).toBe(false);
    const item = { label: 'x', state: 'todo' };
    expect(announcementInputSchema.safeParse({ ...ok, progress: Array(16).fill(item) }).success).toBe(false);
  });
});
