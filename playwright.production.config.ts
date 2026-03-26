import { defineConfig, devices } from '@playwright/test';

/**
 * Production E2E test configuration
 * Targets: https://204.168.181.142
 */

// Only chromium for production testing
const projects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: false,
  retries: 1,
  workers: 1,
  reporter: 'list',
  timeout: 120000,
  use: {
    baseURL: 'https://204.168.181.142',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    timeout: 60000,
  },
  projects,
  // No webServer - testing against live production
});
