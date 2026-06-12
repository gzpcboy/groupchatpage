import { expect, test } from '@playwright/test';

const runLive = process.env.PLAYWRIGHT_LIVE === '1';
const liveUrl = process.env.PLAYWRIGHT_LIVE_URL;

test.skip(!runLive || !liveUrl, 'Set PLAYWRIGHT_LIVE=1 and PLAYWRIGHT_LIVE_URL to run live sign-in checks.');

test('shows the browser-only token onboarding on the real site', async ({ page }) => {
  await page.goto(liveUrl!, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });

  await expect(page.locator('#token-onboarding')).toBeVisible();
  await expect(page.locator('#windows-token-script')).toContainText('copilot_internal/v2/token');
  await expect(page.locator('#token-save-btn')).toBeVisible();
});
