import { test, expect } from '@playwright/test';

test.describe('Chat', () => {
  test('room page loads', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    // Wait for navigation to room
    await expect(page).toHaveURL(/\/room\/.+/);

    // Wait for any state to settle
    await page.waitForTimeout(3000);

    // Just verify we're on the room page
    const url = page.url();
    expect(url).toContain('/room/');
  });

  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Peer' })).toBeVisible();
  });

  test('can navigate to room', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    // Should navigate to room
    await expect(page).toHaveURL(/\/room\/.+/);
  });
});
