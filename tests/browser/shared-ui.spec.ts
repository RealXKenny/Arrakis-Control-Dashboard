import { test, expect } from '../helpers/browser-test';

test('shared dialog helpers wrap visible controls and restore scrolling and focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open appearance studio', exact: true });
  const previous = await page.evaluate(() => document.body.style.overflow);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Appearance studio' });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  const first = dialog.getByRole('button', { name: 'Close appearance studio', exact: true });
  const last = dialog.getByRole('button', { name: 'Done', exact: true });
  await dialog.evaluate((element) => {
    for (const state of ['hidden', 'disabled', 'inert', 'negative']) {
      const button = document.createElement('button');
      button.textContent = state;
      if (state === 'negative') button.tabIndex = -1;
      else button.setAttribute(state, '');
      element.append(button);
    }
  });
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(previous);
});

test('shared focus containment supports an empty modal without leaking focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open appearance studio', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Appearance studio' });
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) => {
    for (const control of element.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
      'button, input, select',
    ))
      control.disabled = true;
    element.tabIndex = -1;
    element.focus();
  });
  await page.keyboard.press('Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
