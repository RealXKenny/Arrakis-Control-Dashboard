import { test, expect } from '../helpers/browser-test';
import { player } from '../helpers/portal-browser';

test('four vehicles form two equal rows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.route('**/api/player', (route) =>
    route.fulfill({
      json: {
        ...player,
        details: {
          ...player.details,
          vehicles: {
            rows: Array.from({ length: 4 }, (_, i) => ({
              id: String(i),
              name: `Sandbike ${i + 1}`,
              relationship: 'owner',
              owner_name: player.characterName,
            })),
          },
        },
      },
    }),
  );
  await page.goto('/portal?view=vehicles');
  const cards = page.locator('.vehicle-grid > div');
  await expect(cards).toHaveCount(4);
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => ({ y: node.getBoundingClientRect().y, width: node.getBoundingClientRect().width })),
  );
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(boxes[2].y).toBe(boxes[3].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[0].width).toBe(boxes[3].width);
});

test('container vehicles show cargo instead of fuel and shared filters survive empty results', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.route('**/api/player', (route) =>
    route.fulfill({
      json: {
        ...player,
        details: {
          ...player.details,
          vehicles: {
            rows: [
              {
                id: 'container',
                name: 'BP_ContainerVehicle',
                type: 'BP_ContainerVehicle',
                relationship: 'owner',
                owner_name: player.characterName,
                condition_percent: 99,
                fuel_percent: 0,
                storage_used: 15,
                storage_capacity: 45,
              },
            ],
          },
        },
      },
    }),
  );
  await page.goto('/portal?view=vehicles');
  const card = page.locator('article').filter({ hasText: 'BP_ContainerVehicle' });
  await expect(card.getByText('Cargo capacity', { exact: true })).toBeVisible();
  await expect(card.getByText('15 / 45 slots', { exact: true })).toBeVisible();
  await expect(card.getByText('Fuel', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/vehicles-container.png', fullPage: true });
  await page.getByRole('button', { name: /Shared Vehicles/ }).click();
  await expect(page.getByRole('button', { name: /Own Vehicles/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Shared Vehicles/ })).toBeVisible();
  await expect(page.getByText('No vehicles found', { exact: true })).toBeVisible();
  await expect(page.getByText('You do not have access to any shared vehicles.', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/vehicles-shared-empty.png', fullPage: true });
});
