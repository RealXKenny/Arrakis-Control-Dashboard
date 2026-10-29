import { expect, test } from '@playwright/test';

test('loads the announcement project once and keeps it available after navigation', async ({ page }) => {
  let loads = 0;
  let apiRequests = 0;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) errors.push(message.text());
  });
  await page.route('https://announcify.app/widget.js', async (route) => {
    loads++;
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        const script = document.querySelector('script[data-project-id]');
        fetch(script.dataset.apiBase + '/api/widget/' + script.dataset.projectId).then(() => {
          const launcher = document.createElement('button');
          launcher.textContent = 'Announcement test launcher';
          document.body.appendChild(launcher);
        });
      `,
    });
  });
  await page.route('https://announcify.app/api/widget/cmvsu06fg00001v0xfjofkwxp', async (route) => {
    apiRequests++;
    await route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Announcement test launcher' })).toBeVisible();
  await page.getByRole('link', { name: /Open your portal/ }).click();
  await expect(page).toHaveURL(/\/portal/);
  await expect(page.getByRole('button', { name: 'Announcement test launcher' })).toBeVisible();
  expect(loads).toBe(1);
  expect(apiRequests).toBe(1);
  expect(errors).toEqual([]);
});
