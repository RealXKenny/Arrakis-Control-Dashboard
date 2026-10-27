import { describe, expect, it } from 'vitest';
import { getShareMetadata, SHARE } from '../../src/modules/sharing/metadata';

describe('public sharing metadata', () => {
  it('builds a bounded Discord card with only link buttons and public content', () => {
    const metadata = getShareMetadata('https://community.example/path?private=value')!;
    const payload = JSON.parse(metadata.json);
    expect(metadata.url).toBe('https://community.example/');
    expect(metadata.image).toBe('https://community.example/api/assets/share/preview-v1.png');
    expect(Buffer.byteLength(metadata.json)).toBeLessThanOrEqual(3000);
    expect(Object.keys(payload)).toEqual(['component']);
    expect(payload.component.type).toBe(17);
    expect(payload.component.accent_color).toBe(0xb94d58);
    const buttons = payload.component.components.find((component: { type: number }) => component.type === 1).components;
    expect(buttons.map((button: { url: string }) => button.url)).toEqual([
      'https://community.example/',
      'https://community.example/portal',
      SHARE.discordUrl,
    ]);
    for (const button of buttons) expect(button).toMatchObject({ type: 2, style: 5 });
    expect(metadata.json).not.toMatch(/private=value|admin|playerId|BOT_API_TOKEN|CONSOLE_API_KEY/);
  });
  it.each([
    null,
    undefined,
    '',
    'not a url',
    'javascript:alert(1)',
    'ftp://example.com',
    'https://user:secret@example.com',
  ])('omits absolute preview URLs for invalid or missing configuration: %s', (origin) => {
    expect(getShareMetadata(origin)).toBeNull();
  });
  it('escapes JSON delimiters for safe server-rendered script content', () => {
    const metadata = getShareMetadata('https://community.example')!;
    expect(metadata.json).not.toContain('<');
    expect(JSON.parse(metadata.json)).toHaveProperty('component');
  });
});
