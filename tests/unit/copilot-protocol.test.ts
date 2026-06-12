import { describe, expect, it } from 'vitest';

import {
  buildCopilotRequest,
  expandModelConfigs,
  extractStreamText,
  extractStreamUsage,
  isModelNotSupportedError,
  nanoAiuToUsd,
  toResponsesInput,
} from '../../src/copilot-protocol';
import type { CopilotModelConfig, Message } from '../../src/types';

describe('copilot protocol helpers', () => {
  it('builds GPT-5.4 chat requests with max_completion_tokens and no custom temperature', () => {
    const config: CopilotModelConfig = {
      model: 'gpt-5.4',
      maxTokensParameter: 'max_completion_tokens',
      temperature: null,
    };
    const messages: Message[] = [{ role: 'user', content: 'hello' }];

    const request = buildCopilotRequest(config, messages, 1200, 0.65, true);

    expect(request.path).toBe('https://api.githubcopilot.com/chat/completions');
    expect(request.body.max_completion_tokens).toBe(1200);
    expect(request.body.temperature).toBeUndefined();
    expect(request.body.max_tokens).toBeUndefined();
  });

  it('builds MAI responses requests with output_text history mapping', () => {
    const config: CopilotModelConfig = {
      model: 'mai-code-1-flash-internal',
      endpoint: 'responses',
      maxTokensParameter: 'max_output_tokens',
      temperature: null,
    };
    const messages: Message[] = [
      { role: 'system', content: 'Be brief.' },
      { role: 'assistant', content: 'Earlier answer.' },
      { role: 'user', content: 'Continue.' },
    ];

    const request = buildCopilotRequest(config, messages, 900, 0.65, true);

    expect(request.path).toBe('https://api.githubcopilot.com/responses');
    expect(request.body.max_output_tokens).toBe(900);
    expect(request.body.temperature).toBeUndefined();
    expect(request.body.input).toEqual([
      { role: 'system', content: [{ type: 'input_text', text: 'Be brief.' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'Earlier answer.' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'Continue.' }] },
    ]);
  });

  it('extracts final MAI text when the stream only provides output_text.done', () => {
    const parsed = extractStreamText(JSON.stringify({
      type: 'response.output_text.done',
      text: 'Final answer.',
    }));

    expect(parsed).toEqual({ text: 'Final answer.', final: true });
  });

  it('extracts chat-completions usage events', () => {
    const usage = extractStreamUsage(JSON.stringify({
      id: 'chat-1',
      model: 'gpt-5.4',
      copilot_usage: { total_nano_aiu: 8500000 },
    }));

    expect(usage).toEqual({
      requestKey: 'chat-1',
      model: 'gpt-5.4',
      nanoAiu: 8500000,
    });
  });

  it('extracts responses usage events', () => {
    const usage = extractStreamUsage(JSON.stringify({
      copilot_usage: { total_nano_aiu: 3000000 },
      response: { id: 'resp-1', model: 'mai-code-1-flash-internal' },
    }));

    expect(usage).toEqual({
      requestKey: 'resp-1',
      model: 'mai-code-1-flash-internal',
      nanoAiu: 3000000,
    });
  });

  it('expands fallback candidate configs in order', () => {
    const config: CopilotModelConfig = {
      model: 'claude-sonnet-4.6',
      modelCandidates: ['claude-sonnet-4.5'],
    };

    const expanded = expandModelConfigs(config);

    expect(expanded.map((entry) => entry.model)).toEqual([
      'claude-sonnet-4.6',
      'claude-sonnet-4.5',
    ]);
  });

  it('detects model_not_supported API errors', () => {
    expect(isModelNotSupportedError('{"error":{"code":"model_not_supported"}}')).toBe(true);
    expect(isModelNotSupportedError('{"error":{"code":"invalid_request_body"}}')).toBe(false);
  });

  it('converts nano AI credits to USD', () => {
    expect(nanoAiuToUsd(8500000)).toBe(0.000085);
  });

  it('maps assistant messages to output_text for responses input', () => {
    const input = toResponsesInput([
      { role: 'assistant', content: 'Reply' },
    ]);

    expect(input).toEqual([
      { role: 'assistant', content: [{ type: 'output_text', text: 'Reply' }] },
    ]);
  });
});
