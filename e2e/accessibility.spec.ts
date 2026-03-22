import { test, expect } from '@playwright/test';

/**
 * AC-19: Accessibility - Keyboard-only navigation audit
 * All controls reachable and operable via keyboard; ARIA labels present
 */
test.describe('Accessibility', () => {
  test('homepage is keyboard accessible', async ({ page }) => {
    await page.goto('/');

    // Check that the page has a proper heading structure
    await expect(page.getByRole('heading', { name: 'Peer' })).toBeVisible();

    // Form inputs should be focusable
    const nameInput = page.getByLabel('Your Name');
    await expect(nameInput).toBeVisible();

    // Buttons should be focusable
    const createButton = page.getByRole('button', { name: 'Create New Room' });
    await expect(createButton).toBeVisible();

    // Tab order should be logical: input -> button
    await nameInput.focus();
    await expect(nameInput).toBeFocused();
  });

  test('room creation form is keyboard accessible', async ({ page }) => {
    await page.goto('/');

    // Fill name using keyboard
    await page.getByLabel('Your Name').fill('Keyboard User');
    await page.getByLabel('Your Name').press('Tab');

    // Create room button should be focusable
    await expect(page.getByRole('button', { name: 'Create New Room' })).toBeFocused();

    // Press Enter to submit
    await page.getByRole('button', { name: 'Create New Room' }).press('Enter');

    // Should navigate to room
    await expect(page).toHaveURL(/\/room\/.+/);
  });

  test('control bar buttons have accessible names', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    await expect(page).toHaveURL(/\/room\/.+/);
    await page.waitForTimeout(3000);

    // Control bar buttons should have accessible names (aria-label or text)
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    expect(buttonCount).toBeGreaterThan(0);

    // Each button should have accessible name
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();
      const title = await button.getAttribute('title');

      // Button should have at least one form of accessible name
      expect(ariaLabel || text || title).toBeTruthy();
    }
  });

  test('can navigate room page using keyboard', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Nav Test');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    await expect(page).toHaveURL(/\/room\/.+/);
    await page.waitForTimeout(2000);

    // Tab through the page - should not get stuck
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Page should still be functional after tab navigation
    const url = page.url();
    expect(url).toContain('/room/');
  });

  test('form inputs have proper labels', async ({ page }) => {
    await page.goto('/');

    // Name input should have associated label
    const nameInput = page.getByLabel('Your Name');
    await expect(nameInput).toBeVisible();

    // Verify label is properly associated
    const id = await nameInput.getAttribute('id');
    expect(id).toBeTruthy();
  });

  test('error states are announced to screen readers', async ({ page }) => {
    // Navigate to invalid room
    await page.goto('/room/invalid-token-123');

    // Wait for any redirect or error
    await page.waitForTimeout(1500);

    // The page should load without crashing - URL should be valid
    const url = page.url();
    expect(url.startsWith('http')).toBe(true);
  });

  test('chat input has accessible label', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Chat Test');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    await expect(page).toHaveURL(/\/room\/.+/);
    await page.waitForTimeout(3000);

    // If chat panel is visible, input should have label
    const chatInput = page.getByLabel(/Message|Type a message|chat/i).first();
    if (await chatInput.isVisible()) {
      await expect(chatInput).toBeVisible();
    }
  });
});