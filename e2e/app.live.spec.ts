import { expect, test } from '@playwright/test';

import { setParticipantSelection, setTurns } from './test-helpers';

const githubToken = process.env.E2E_GITHUB_TOKEN;
const runLive = process.env.PLAYWRIGHT_LIVE === '1';

test.skip(!runLive || !githubToken, 'Set PLAYWRIGHT_LIVE=1 and E2E_GITHUB_TOKEN to run live Copilot tests.');

test('runs a real-model browser chat with a pre-seeded Copilot token', async ({ page }) => {
  test.setTimeout(240_000);

  const tokenRes = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/json',
      'Editor-Version': 'vscode/1.96.0',
      'Editor-Plugin-Version': 'copilot-chat/0.23.0',
      'Copilot-Integration-Id': 'vscode-chat',
    },
  });
  const tokenData = await tokenRes.json() as { token: string };

  await page.addInitScript((token: string) => {
    window.localStorage.setItem('copilot_access_token', token);
  }, tokenData.token);

  await page.goto('/');

  await expect(page.locator('#user-info')).toBeVisible();
  await expect(page.locator('#checkbox-grid')).toContainText('Claude Haiku 4.5');

  await page.locator('#topic-input').fill('In one practical paragraph, when should a small team choose async communication over meetings?');
  await setTurns(page, 1);
  await setParticipantSelection(page, ['gpt54']);

  await page.locator('#start-btn').click();

  await expect(page.locator('#status-text')).toContainText('Done', { timeout: 120_000 });
  await expect(page.locator('#chat-messages .msg-wrap')).toHaveCount(1);
  await expect(page.locator('#summary-content')).not.toBeEmpty();
  await expect(page.locator('#judge-content')).not.toBeEmpty();
});
