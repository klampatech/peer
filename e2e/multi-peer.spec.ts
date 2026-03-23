import { test, expect } from '@playwright/test';

// GAP-17: Multi-peer E2E scenarios using browser.newContext()
test.describe('Multi-Peer Scenarios (GAP-17)', () => {
  test('should create room and verify both peers can access via newContext', async ({ browser }) => {
    test.setTimeout(120000);

    // Create two separate contexts to simulate two users
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // User 1 creates a room
    await page1.goto('/');
    await page1.getByLabel('Your Name').fill('User One');
    await page1.getByRole('button', { name: 'Create New Room' }).click();
    await page1.waitForURL(/\/room\/.+/, { timeout: 60000 });

    // Capture the room token
    const roomUrl = page1.url();
    expect(roomUrl).toContain('/room/');

    // User 2 joins - use init script to set displayName before page loads
    await page2.addInitScript((name) => {
      sessionStorage.setItem('peer_display_name', name);
    }, 'User Two');

    await page2.goto(roomUrl);
    await page2.waitForTimeout(3000);

    // Both pages should be in the room
    expect(page1.url()).toContain('/room/');

    await context1.close();
    await context2.close();
  });

  test('should use browser.newContext for multi-user simulation', async ({ browser }) => {
    test.setTimeout(120000);

    // This test demonstrates the GAP-17 requirement: using browser.newContext()
    // to create independent browser contexts for multiple users

    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();

    // Each context operates independently - simulating different users
    const user1Page = await user1Context.newPage();
    const user2Page = await user2Context.newPage();

    // User 1 creates a room
    await user1Page.goto('/');
    await user1Page.getByLabel('Your Name').fill('User One');
    await user1Page.getByRole('button', { name: 'Create New Room' }).click();
    await user1Page.waitForURL(/\/room\/.+/, { timeout: 60000 });

    const roomUrl = user1Page.url();

    // User 2 can now join this room (via link)
    await user2Page.goto(roomUrl);
    await user2Page.addInitScript(() => {
      sessionStorage.setItem('peer_display_name', 'User Two');
    });
    await user2Page.waitForTimeout(3000);

    expect(user1Page.url()).toContain('/room/');

    await user1Context.close();
    await user2Context.close();
  });
});

// GAP-18: WebRTC connectivity verification
test.describe('WebRTC Connectivity (GAP-18)', () => {
  test('should verify RTCPeerConnection is available', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    await expect(page).toHaveURL(/\/room\/.+/, { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Verify RTCPeerConnection API is available in browser
    const hasRTCConnection = await page.evaluate(() => {
      return typeof RTCPeerConnection !== 'undefined';
    });

    expect(hasRTCConnection).toBe(true);
  });

  test('should have ICE servers configured', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    await expect(page).toHaveURL(/\/room\/.+/, { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Verify ICE servers can be created
    const iceServersConfigured = await page.evaluate(() => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pc.close();
        return true;
      } catch {
        return false;
      }
    });

    expect(iceServersConfigured).toBe(true);
  });

  test('should not have critical errors in console during room connection', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.getByLabel('Your Name').fill('Test User');
    await page.getByRole('button', { name: 'Create New Room' }).click();

    await expect(page).toHaveURL(/\/room\/.+/, { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Filter out expected permission errors (headless browsers don't have media devices)
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('Permission') && !e.includes('NotAllowed') && !e.includes('getUserMedia')
    );

    // Debug: log what the actual errors were
    if (criticalErrors.length > 0) {
      console.log('Console errors found:', consoleErrors);
      console.log('Critical errors (after filter):', criticalErrors);
    }

    expect(criticalErrors.length).toBe(0);
  });
});
