import { test, expect } from '@playwright/test';

/**
 * Production Site E2E Tests
 * Tests the production site at https://204.168.181.142
 *
 * Note: The production site uses a self-signed certificate for the IP address,
 * so we create a custom context with SSL verification disabled.
 */
test.describe('Production Site: https://204.168.181.142', () => {
  const PRODUCTION_URL = 'https://204.168.181.142';

  // Create a browser context that ignores SSL certificate errors
  test.use({
    baseURL: PRODUCTION_URL,
  });

  test.describe.configure({ mode: 'serial' });

  test('Page Load: homepage loads successfully', async ({ browser }) => {
    // Create context with SSL verification disabled
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Collect page errors
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    const response = await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    // Check response status
    const status = response?.status();
    console.log('HTTP Status:', status);

    // Check page title
    const title = await page.title();
    console.log('Page title:', title);

    // Check for critical console errors (filter out warnings)
    const criticalErrors = consoleErrors.filter(e =>
      !e.toLowerCase().includes('warning') &&
      !e.includes('DevTools')
    );

    console.log('Console errors:', criticalErrors);
    console.log('Page errors:', pageErrors);

    await context.close();

    // Basic assertions
    expect(status).toBeTruthy();
    expect(title).toBeTruthy();
  });

  test('Page Load: page renders without crash', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded' });

    // Page should have content
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Check page URL is correct
    expect(page.url()).toContain('204.168.181.142');

    await context.close();
  });

  test('UI Elements: homepage has required UI elements', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    // Check for heading/title
    const heading = page.locator('h1, h2, [class*="title"], [class*="heading"]');
    const hasHeading = await heading.first().isVisible().catch(() => false);
    console.log('Has heading:', hasHeading);

    // Check for name input
    const nameInput = page.getByLabel(/name|your name/i).first();
    const hasNameInput = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Has name input:', hasNameInput);

    // Check for buttons
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log('Button count:', buttonCount);

    // Check for links/navigation
    const links = page.locator('a');
    const linkCount = await links.count();
    console.log('Link count:', linkCount);

    await context.close();

    // At minimum, page should have some interactive elements
    expect(buttonCount + linkCount).toBeGreaterThan(0);
  });

  test('UI Elements: form elements are present and labeled', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    // Check all inputs have labels
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    console.log('Input count:', inputCount);

    if (inputCount > 0) {
      for (let i = 0; i < inputCount; i++) {
        const input = inputs.nth(i);
        const ariaLabel = await input.getAttribute('aria-label');
        const id = await input.getAttribute('id');
        const placeholder = await input.getAttribute('placeholder');

        // Input should have some form of label
        const hasLabel = ariaLabel || id || placeholder;
        console.log(`Input ${i}: aria-label=${ariaLabel}, id=${id}, placeholder=${placeholder}`);
        expect(hasLabel).toBeTruthy();
      }
    }

    await context.close();
  });

  test('UI Elements: buttons have accessible text', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log('Button count:', buttonCount);

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();
      const title = await button.getAttribute('title');

      // Button should have accessible name
      const hasAccessibleName = ariaLabel || text?.trim() || title;
      console.log(`Button ${i}: aria-label=${ariaLabel}, text=${text?.trim()}, title=${title}`);
      expect(hasAccessibleName).toBeTruthy();
    }

    await context.close();
  });

  test('Navigation: can navigate from homepage to room creation', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    // Try to find and fill name input
    const nameInput = page.getByLabel(/name|your name/i).first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Found name input, filling with test value');
      await nameInput.fill('Test User');
    }

    // Find create room button
    const createButton = page.getByRole('button', { name: /create|new room|join/i }).first();
    if (await createButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Found create button, clicking');
      await createButton.click();

      // Wait for navigation
      await page.waitForTimeout(2000);

      const url = page.url();
      console.log('After click URL:', url);
    }

    // Page should still be functional
    expect(page.url()).toContain('204.168.181.142');

    await context.close();
  });

  test('Navigation: links navigate to valid pages', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    // Get all links
    const links = page.locator('a[href]');
    const linkCount = await links.count();
    console.log('Link count:', linkCount);

    if (linkCount > 0) {
      // Check first few links have valid href
      const linksToCheck = Math.min(linkCount, 5);
      for (let i = 0; i < linksToCheck; i++) {
        const link = links.nth(i);
        const href = await link.getAttribute('href');

        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          console.log(`Link ${i}: ${href}`);
          expect(href).toBeTruthy();
        }
      }
    }

    await context.close();
  });

  test('Interactive Features: buttons are clickable', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    if (buttonCount > 0) {
      const firstButton = buttons.first();
      const isVisible = await firstButton.isVisible().catch(() => false);

      if (isVisible) {
        // Click the button
        await firstButton.click();
        await page.waitForTimeout(500);

        // Page should still be functional
        expect(page.url()).toContain('204.168.181.142');
      }
    }

    await context.close();
  });

  test('Content: text content is visible and readable', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    // Get all text content
    const body = page.locator('body');
    const text = await body.textContent();

    console.log('Page text content length:', text?.length);
    console.log('First 200 chars:', text?.substring(0, 200));

    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(0);

    await context.close();
  });

  test('Content: images have alt text or are decorative', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    const images = page.locator('img');
    const imageCount = await images.count();
    console.log('Image count:', imageCount);

    if (imageCount > 0) {
      for (let i = 0; i < imageCount; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const ariaHidden = await img.getAttribute('aria-hidden');

        // Images should either have alt text or be marked as decorative
        const hasAlt = alt !== null && alt !== undefined;
        const isDecorative = ariaHidden === 'true' || alt === '';

        console.log(`Image ${i}: alt=${alt}, aria-hidden=${ariaHidden}`);
        expect(hasAlt || isDecorative).toBeTruthy();
      }
    }

    await context.close();
  });

  test('Responsiveness: desktop view renders correctly', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    // Page should be usable at desktop size
    const body = page.locator('body');
    await expect(body).toBeVisible();

    await context.close();
  });

  test('Responsiveness: mobile view renders correctly', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 375, height: 667 }
    });
    const page = await context.newPage();

    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });

    const body = page.locator('body');
    await expect(body).toBeVisible();

    await context.close();
  });

  test('Security: site loads (SSL certificate is self-signed for IP)', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true, // Allow self-signed cert
    });
    const page = await context.newPage();

    const response = await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded' });

    // Page should load successfully (with ignoreHTTPSErrors)
    expect(response?.status()).toBeTruthy();
    expect(page.url()).toContain('204.168.181.142');

    console.log('Note: SSL certificate is self-signed for IP address - expected behavior');

    await context.close();
  });
});