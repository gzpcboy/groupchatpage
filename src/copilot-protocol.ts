import { COPILOT_CHAT_PATH, COPILOT_RESPONSES_PATH } from './api-paths';
import type { CopilotModelConfig, CopilotUsage, Message } from './types';

export function parseExpiresAt(expiresAt: string | number): number {
  if (typeof expiresAt === 'number') {
    return expiresAt > 1_000_000_000_000 ? expiresAt : expiresAt * 1000;
  }

  const isoTime = Date.parse(expiresAt);
  if (Number.isFinite(isoTime)) {
    return isoTime;
  }

  const numericTime = Number(expiresAt);
  if (Number.isFinite(numericTime)) {
    return numericTime > 1_000_000_000_000 ? numericTime : numericTime * 1000;
  }

  throw new Error('Copilot token exchange returned an invalid expiry.');
}

export function expandModelConfigs(modelConfig: CopilotModelConfig): CopilotModelConfig[] {
  return [modelConfig, ...(modelConfig.modelCandidates ?? []).map((model) => ({
    ...modelConfig,
    model,
    modelCandidates: undefined,
  }))];
}

export function buildCopilotRequest(
  modelConfig: CopilotModelConfig,
  messages: Message[],
  maxTokens: number,
  temperature: number,
  stream: boolean,
): { path: string; body: Record<string, unknown> } {
  const endpoint = modelConfig.endpoint ?? 'chat_completions';
  const tokenParameter = modelConfig.maxTokensParameter
    ?? (endpoint === 'responses' ? 'max_output_tokens' : 'max_tokens');
  const requestTemperature = resolveTemperature(modelConfig, temperature);

  if (endpoint === 'responses') {
    const body: Record<string, unknown> = {
      model: modelConfig.model,
      input: toResponsesInput(messages),
      stream,
      [tokenParameter]: maxTokens,
    };
    if (modelConfig.reasoningEffort) {
      body.reasoning = { effort: modelConfig.reasoningEffort };
    }
    if (requestTemperature !== undefined) {
      body.temperature = requestTemperature;
    }
    return { path: COPILOT_RESPONSES_PATH, body };
  }

  const body: Record<string, unknown> = {
    model: modelConfig.model,
    messages,
    stream,
    [tokenParameter]: maxTokens,
  };
  if (modelConfig.reasoningEffort) {
    body.reasoning_effort = modelConfig.reasoningEffort;
  }
  if (requestTemperature !== undefined) {
    body.temperature = requestTemperature;
  }
  return { path: COPILOT_CHAT_PATH, body };
}

export function toResponsesInput(messages: Message[]): Array<{
  role: Message['role'];
  content: Array<{ type: 'input_text' | 'output_text'; text: string }>;
}> {
  return messages.map((message) => ({
    role: message.role,
    content: [
      {
        type: message.role === 'assistant' ? 'output_text' : 'input_text',
        text: message.content,
      },
    ],
  }));
}

export function extractStreamText(payload: string): { text?: string; final?: boolean } {
  const parsed = JSON.parse(payload) as {
    type?: string;
    text?: string;
    delta?: string;
    choices?: Array<{ delta?: { content?: string | null } }>;
  };

  const chatContent = parsed.choices?.[0]?.delta?.content;
  if (typeof chatContent === 'string' && chatContent.length > 0) {
    return { text: chatContent };
  }

  if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
    return { text: parsed.delta };
  }

  if (parsed.type === 'response.output_text.done' && typeof parsed.text === 'string') {
    return { text: parsed.text, final: true };
  }

  return {};
}

export function extractStreamUsage(payload: string): CopilotUsage | undefined {
  const parsed = JSON.parse(payload) as {
    id?: string;
    model?: string;
    response?: { id?: string; model?: string };
    copilot_usage?: { total_nano_aiu?: number };
  };

  const nanoAiu = parsed.copilot_usage?.total_nano_aiu;
  const requestKey = parsed.id ?? parsed.response?.id;
  const model = parsed.model ?? parsed.response?.model;

  if (typeof nanoAiu !== 'number' || !requestKey || !model) {
    return undefined;
  }

  return { requestKey, model, nanoAiu };
}

export function nanoAiuToUsd(nanoAiu: number): number {
  return nanoAiu / 100_000_000_000;
}

export function isModelNotSupportedError(text: string): boolean {
  return text.includes('"code":"model_not_supported"');
}

export function describeRequest(modelConfig: CopilotModelConfig, path: string): string {
  const endpoint = path === COPILOT_RESPONSES_PATH ? '/responses' : '/chat/completions';
  return `Copilot request for ${modelConfig.model} via ${endpoint}`;
}

function resolveTemperature(modelConfig: CopilotModelConfig, fallback: number): number | undefined {
  if (modelConfig.temperature === null) {
    return undefined;
  }
  if (typeof modelConfig.temperature === 'number') {
    return modelConfig.temperature;
  }
  return fallback;
}
