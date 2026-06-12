// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ALL_PARTICIPANTS, JUDGE_MODEL, SUMMARY_MODEL } from '../../src/config';
import { clearCopilotSession, complete, setCopilotToken } from '../../src/copilot';

const githubToken = process.env.E2E_GITHUB_TOKEN;
const runLive = process.env.COPILOT_LIVE === '1';
const describeLive = runLive && githubToken ? describe : describe.skip;

let copilotToken = '';

describeLive('copilot headless live client', () => {
  beforeAll(async () => {
    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.96.0',
        'Editor-Plugin-Version': 'copilot-chat/0.23.0',
        'Copilot-Integration-Id': 'vscode-chat',
      },
    });
    const data = await res.json() as { token: string };
    copilotToken = data.token;
  });

  afterEach(() => {
    clearCopilotSession();
  });

  for (const participant of ALL_PARTICIPANTS) {
    it(`gets a non-empty reply from ${participant.name}`, async () => {
      setCopilotToken(copilotToken);

      const result = await complete(
        participant,
        [{
          role: 'user',
          content: `In one short sentence, confirm you are working and include the word "ok". (${participant.name})`,
        }],
        participant.model.startsWith('gemini-') ? 320 : 120,
        0.2,
      );

      expect(result.trim().length, participant.name).toBeGreaterThan(0);
    }, 240_000);
  }

  it('gets a non-empty reply from the summary model', async () => {
    setCopilotToken(copilotToken);

    const summary = await complete(
      SUMMARY_MODEL,
      [{ role: 'user', content: 'In one short sentence, confirm you are working and include "summary ok".' }],
      120,
      0.2,
    );

    expect(summary.trim().length).toBeGreaterThan(0);
  }, 240_000);

  it('gets a non-empty reply from the judge model', async () => {
    setCopilotToken(copilotToken);

    const judge = await complete(
      JUDGE_MODEL,
      [{ role: 'user', content: 'In one short sentence, confirm you are working and include "judge ok".' }],
      120,
      0.2,
    );

    expect(judge.trim().length).toBeGreaterThan(0);
  }, 240_000);
});
