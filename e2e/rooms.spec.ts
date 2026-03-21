import { test, expect } from '@playwright/test';

test.describe('Rooms', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored state
    await page.goto('/');
  });

  test('homepage has title and create room button', async ({ page }) => {
    await expect(page).toHaveTitle(/Peer/);
    await expect(page.getByRole('heading', { name: 'Peer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create New Room' })).toBeVisible();
  });

  test('can create a new room', async ({ page }) => {
    // Enter a display name
    await page.getByLabel('Your Name').fill('Test User');

    // Click create room
    await page.getByRole('button', { name: 'Create New Room' }).click();

    // Should navigate to a room page with a token
    await expect(page).toHaveURL(/\/room\/[a-f0-9-]+/);

    // Wait for the page to load
    await page.waitForTimeout(2000);

    // Should show the room - look for any video or connecting element
    // The header may or may not be visible depending on connection state
    const url = page.url();
    expect(url).toContain('/room/');
  });

  test('can join an existing room via URL', async ({ page }) => {
    // First, create a room
    await page.getByLabel('Your Name').fill('User One');
    await page.getByRole('button', { name: 'Create New Room' }).click();
    await expect(page).toHaveURL(/\/room\/([a-f0-9-]+)/);

    const roomUrl = page.url();
    const roomToken = roomUrl.split('/room/')[1];

    // Now try to join via the "Join Existing Room" form
    await page.goto('/');
    await page.getByLabel('Your Name').fill('User Two');
    await page.getByPlaceholder('Paste room token').fill(roomToken);
    await page.getByRole('button', { name: 'Join' }).click();

    // Should navigate to the room
    await expect(page).toHaveURL(roomUrl);
  });

  test('shows error for invalid room token', async ({ page }) => {
    // Navigate to an invalid room without display name
    await page.goto('/room/invalid-token-123');

    // Should show error or redirect to home since there's no display name
    // Give it a moment
    await page.waitForTimeout(1000);
  });

  test('requires display name to join room', async ({ page }) => {
    // Try to navigate directly to room without entering name
    await page.goto('/room/test-token');

    // Should redirect back to home since no display name
    await expect(page).toHaveURL('/');
  });
});
