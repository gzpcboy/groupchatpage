import { expect, test } from '@playwright/test';

const runLive = process.env.PLAYWRIGHT_LIVE === '1';
const liveUrl = process.env.PLAYWRIGHT_LIVE_URL;

test.skip(!runLive || !liveUrl, 'Set PLAYWRIGHT_LIVE=1 and PLAYWRIGHT_LIVE_URL to run live domain routing checks.');

test('serves the app directly on the configured live URL with no redirect', async ({ page }) => {
  await page.goto(liveUrl!, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });

  await expect(page).toHaveURL(liveUrl!);
  await expect(page).toHaveTitle('GroupChat — Powered by GitHub Copilot');
  await expect(page.locator('body')).toContainText('Multi-model group chat');
  await expect(page.locator('#start-btn')).toBeVisible();
});
