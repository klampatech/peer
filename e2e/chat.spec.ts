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

  test('chat input field exists in room', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    // Wait for room to load
    await page.waitForTimeout(2000);

    // Check for chat input - look for message input field
    const chatInput = page.getByPlaceholder(/message|chat/i);
    await expect(chatInput).toBeVisible();
  });

  test('can type and submit chat message', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    // Wait for room to load
    await page.waitForTimeout(2000);

    // Find and fill the chat input
    const chatInput = page.getByPlaceholder(/message|chat/i);
    await chatInput.fill('Hello, world!');

    // Find and click send button
    const sendButton = page.getByRole('button', { name: /send|submit/i });
    await sendButton.click();

    // Wait for message to appear
    await page.waitForTimeout(1000);

    // Verify message appears in the chat
    await expect(page.getByText('Hello, world!')).toBeVisible();
  });
});
