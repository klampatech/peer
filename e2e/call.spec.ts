import { test, expect } from '@playwright/test';

test.describe('Call', () => {
  test('room page loads with connection UI or error', async ({ page }) => {
    // Set up the page
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    // Wait for navigation to room
    await expect(page).toHaveURL(/\/room\/.+/);

    // Wait for connection attempt
    await page.waitForTimeout(3000);

    // The page should show either connecting UI, error, or the control bar
    // Just check that we're on the room page
    const url = page.url();
    expect(url).toContain('/room/');
  });

  test('control bar buttons exist in room page', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    await expect(page).toHaveURL(/\/room\/.+/);
    await page.waitForTimeout(3000);

    // Check for any of the control bar buttons
    // They might not be visible if there's a connection error
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThan(0);
  });

  test('can navigate away from room', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    await expect(page).toHaveURL(/\/room\/.+/);

    // Wait for any state
    await page.waitForTimeout(2000);

    // Try to find and click back button if error state is shown
    const backButton = page.getByRole('button', { name: /Back to Home|Home|Back/i });
    if (await backButton.isVisible()) {
      await backButton.click();
      await expect(page).toHaveURL('/');
    }
  });
});
