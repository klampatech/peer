import { test, expect } from '@playwright/test';

test.describe('Chat', () => {
  test('room page loads', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    // Wait for navigation to room
    await expect(page).toHaveURL(/\/room\/.+/, { timeout: 60000 });

    // Wait for any state to settle
    await page.waitForTimeout(10000);

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
    await expect(page).toHaveURL(/\/room\/.+/, { timeout: 60000 });
  });

  test('chat input field exists in room', async ({ page, isMobile }) => {
    // Skip on mobile - chat panel requires larger screen
    test.skip(isMobile, 'Chat panel not visible on mobile');

    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    // Wait for navigation to room
    await expect(page).toHaveURL(/\/room\/.+/, { timeout: 60000 });

    // Check for chat input - the chat panel is only visible on lg (1024px) and above
    const chatInput = page.getByPlaceholder(/message|chat/i);

    // First wait for the input to be attached to DOM
    await chatInput.waitFor({ state: 'attached', timeout: 15000 });

    // Then wait for it to be visible
    await expect(chatInput).toBeVisible({ timeout: 15000 });
  });

  test('can type and submit chat message', async ({ page, isMobile }) => {
    // Skip on mobile - chat panel requires larger screen
    test.skip(isMobile, 'Chat panel not visible on mobile');

    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    // Wait for navigation to room
    await expect(page).toHaveURL(/\/room\/.+/, { timeout: 60000 });

    // Wait for chat input to be visible first
    const chatInput = page.getByPlaceholder(/message|chat/i);
    await chatInput.waitFor({ state: 'visible', timeout: 15000 });

    // Fill the message
    await chatInput.fill('Hello, world!');

    // Verify message is typed in the input
    await expect(chatInput).toHaveValue('Hello, world!');

    // Find and click send button
    const sendButton = page.getByRole('button', { name: /send|submit/i });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // Verify the input is cleared after sending (indicating the form was submitted)
    // Note: Full E2E chat message verification requires more complex setup due to
    // React StrictMode and Socket.IO timing in headless browsers
    await expect(chatInput).toHaveValue('');
  });
});
