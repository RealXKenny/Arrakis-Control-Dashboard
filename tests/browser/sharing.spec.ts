import { expect, test } from '@playwright/test';

test('Discord reads a complete public preview without JavaScript or authentication', async ({ request }) => {
  for (const path of ['/?theme=halloween&token=not-real', '/portal?view=bases']) {
    const response = await request.get(path, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
        'X-Forwarded-Host': 'untrusted.example',
      },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();
    const head = html.split('</head>')[0];
    const script = head.match(/<script[^>]*id="discord:component-embed"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(Buffer.byteLength(script!)).toBeLessThanOrEqual(3000);
    const embed = JSON.parse(script!);
    expect(embed.component.type).toBe(17);
    const buttons = embed.component.components.find((component: { type: number }) => component.type === 1).components;
    expect(buttons.map((button: { label: string }) => button.label)).toEqual([
      'Visit website',
      'Open portal',
      'Join Discord',
    ]);
    expect(buttons[0].url).toBe('http://127.0.0.1:3100/');
    expect(script).not.toMatch(/not-real|untrusted\.example|\/admin/);
    expect(head.match(/name="description"/g)).toHaveLength(1);
    expect(head).toContain('property="og:title" content="Crimson Skies | Dune: Awakening Community"');
    expect(head).toContain('property="og:url" content="http://127.0.0.1:3100/"');
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
    const mark = embed.component.components[0].accessory.media.url;
    const image = await request.get(mark);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
    expect(image.headers()['content-disposition']).toBeUndefined();
  }
});

test('preview metadata stays inert under CSP and does not duplicate after navigation', async ({ page }) => {
  const errors: string[] = [];
  const authRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/auth/login') authRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy|script-src/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('head script#discord\\:component-embed')).toHaveCount(1);
  await page.getByRole('link', { name: /Open your portal/ }).click();
  await expect(page).toHaveURL(/\/portal/);
  await expect(page.locator('head script#discord\\:component-embed')).toHaveCount(1);
  await expect(page.locator('head meta[property="og:title"]')).toHaveCount(1);
  expect(authRequests).toEqual([]);
  expect(errors).toEqual([]);
});
