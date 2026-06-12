import { expect, test } from '@playwright/test';

import { setParticipantSelection, setTurns } from './test-helpers';

function sseBody(...chunks: string[]): string {
  return [
    ...chunks.map((chunk) => `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n`),
    'data: [DONE]\n',
    '',
  ].join('\n');
}

function sseBodyWithUsage(
  id: string,
  usageNanoAiu: number,
  chunks: string[],
  duplicateUsage = false,
): string {
  const usageFrame = `data: ${JSON.stringify({
    id,
    model: 'mock-model',
    copilot_usage: { total_nano_aiu: usageNanoAiu },
    choices: [{ finish_reason: 'stop', delta: { content: null } }],
  })}\n`;

  return [
    ...chunks.map((chunk) => `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n`),
    usageFrame,
    ...(duplicateUsage ? [usageFrame] : []),
    'data: [DONE]\n',
    '',
  ].join('\n');
}

test('renders a full mocked group chat flow in the browser', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('copilot_access_token', 'copilot-test-token');
  });

  await page.route('https://api.githubcopilot.com/models', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 'gpt-5.4', supported_endpoints: ['/chat/completions'] },
          { id: 'gemini-3.1-pro-preview', supported_endpoints: ['/chat/completions'] },
          { id: 'claude-sonnet-4.6', supported_endpoints: ['/chat/completions'] },
          { id: 'claude-haiku-4.5', supported_endpoints: ['/chat/completions'] },
          { id: 'claude-opus-4.6', supported_endpoints: ['/chat/completions'] },
        ],
      }),
    });
  });

  await page.route('https://api.githubcopilot.com/chat/completions', async (route) => {
    const payload = route.request().postDataJSON() as {
      model?: string;
      max_completion_tokens?: number;
      reasoning_effort?: string;
      max_tokens?: number;
      messages?: Array<{ role: string; content: string }>;
      temperature?: number;
    };

    const combinedPrompt = payload.messages?.map((message) => message.content).join('\n') ?? '';

    if (combinedPrompt.includes('confirm you are working')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBody(`ok from ${payload.model}`),
      });
      return;
    }

    if (combinedPrompt.includes('Summarize a group chat')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBodyWithUsage('summary-1', 20_000_000, ['Summary: GPT-5.4 explored trade-offs.'], true),
      });
      return;
    }

    if (combinedPrompt.includes('final judge of a group chat')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBodyWithUsage('judge-1', 30_000_000, ['Winner: Claude Opus 4.6 picks GPT-5.4 for the clearer practical recommendation.']),
      });
      return;
    }

    switch (payload.model) {
      case 'gpt-5.4':
        expect(typeof payload.max_completion_tokens).toBe('number');
        expect(payload.max_tokens).toBeUndefined();
        expect(payload.temperature).toBeUndefined();
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBodyWithUsage('chat-1', 10_000_000, ['GPT-5.4 opens with a balanced recommendation.']),
        });
        return;
      case 'claude-sonnet-4.6':
        expect(payload.reasoning_effort).toBe('medium');
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBody('Claude Sonnet 4.6 pushes back with nuance.'),
        });
        return;
      case 'claude-opus-4.6':
        expect(payload.reasoning_effort).toBe('medium');
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBody('Winner: Claude Opus 4.6 picks GPT-5.4 for the clearer practical recommendation.'),
        });
        return;
      default:
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBody('Fallback completion.'),
        });
    }
  });

  await page.goto('/');

  await expect(page.locator('#user-name')).toHaveText('Copilot token loaded');
  await expect(page.locator('#checkbox-grid')).toContainText('GPT-5.4 (medium)');
  await expect(page.locator('#checkbox-grid')).toContainText('Gemini 3.1 Pro');
  await expect(page.locator('#checkbox-grid')).toContainText('Claude Sonnet 4.6 (medium)');
  await expect(page.locator('#checkbox-grid')).toContainText('Claude Haiku 4.5');
  await expect(page.locator('#turns-input')).toHaveValue('3');
  await expect(page.locator('#turns-input')).toHaveAttribute('max', '10');
  await expect(page.locator('#turns-value')).toHaveText('3');

  await page.locator('#topic-input').fill('Should teams default to async communication?');
  await setTurns(page, 1);
  await setParticipantSelection(page, ['gpt54']);

  await page.locator('#start-btn').click();

  await expect(page.locator('#status-text')).toContainText('Done');
  await expect(page.locator('#chat-messages .msg-wrap')).toHaveCount(1);
  await expect(page.locator('#summary-content')).toContainText('explored trade-offs');
  await expect(page.locator('#judge-content')).toContainText('Winner: Claude Opus 4.6');
  await expect(page.locator('#usage-total')).toHaveText('$0.0006');
});
