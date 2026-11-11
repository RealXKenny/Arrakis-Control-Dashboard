import { test, expect } from '../helpers/browser-test';

test('local interface fonts load successfully and Archivo retains its width axis', async ({ page }) => {
  const externalFonts: string[] = [];
  page.on('request', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFonts.push(request.url());
  });
  await page.goto('/');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const styles = getComputedStyle(document.documentElement);
    const sans = styles.getPropertyValue('--font-sans').split(',')[0].trim();
    const mono = styles.getPropertyValue('--font-mono').split(',')[0].trim();
    const loadedSans = await document.fonts.load(`400 48px ${sans}`);
    const loadedMono = await document.fonts.load(`400 48px ${mono}`);
    const sample = document.createElement('span');
    sample.textContent = 'Arrakis Control Dashboard';
    Object.assign(sample.style, {
      fontFamily: sans,
      fontSize: '48px',
      fontWeight: '400',
      position: 'absolute',
      visibility: 'hidden',
      whiteSpace: 'nowrap',
    });
    document.body.append(sample);
    sample.style.fontStretch = '62%';
    const narrow = sample.getBoundingClientRect().width;
    sample.style.fontStretch = '125%';
    const wide = sample.getBoundingClientRect().width;
    sample.remove();
    return { sans: loadedSans.map((font) => font.status), mono: loadedMono.map((font) => font.status), narrow, wide };
  });
  expect(fonts.sans).toContain('loaded');
  expect(fonts.mono).toContain('loaded');
  expect(fonts.wide).toBeGreaterThan(fonts.narrow * 1.5);
  expect(externalFonts).toEqual([]);
});
