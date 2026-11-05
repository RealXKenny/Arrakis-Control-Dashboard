import { expect, test as base } from '@playwright/test';

/**
 * Browser tests measure layout and click targets, so entrance animations are switched off for them.
 * The motion itself is verified by the dedicated `entrance motion` tests, which use the plain Playwright test.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      // A constructed stylesheet needs no DOM node yet and is not blocked by the page CSP.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(
        '.fly-in,.fade-in,.fly-in-stagger>*,.shimmer{animation:none!important}html{scroll-behavior:auto!important}',
      );
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    });
    await provide(page);
  },
});
export { expect };
