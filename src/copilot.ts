import { COPILOT_MODELS_PATH } from './api-paths';
import { saveAuthState, type StoredAuthState } from './auth';
import type {
  CopilotModelConfig,
  CopilotModelMetadata,
  CopilotModelProbe,
  CopilotUsage,
  Message,
} from './types';
import {
  buildCopilotRequest,
  describeRequest,
  expandModelConfigs,
  extractStreamText,
  extractStreamUsage,
  isModelNotSupportedError,
  nanoAiuToUsd,
  parseExpiresAt,
} from './copilot-protocol';
import {
  MODEL_API_RETRY_DELAYS_MS,
  shouldRetryModelRequest,
  waitForRetry,
} from './copilot-retry';

let copilotToken: string | null = null;
let githubToken: string | null = null;
let copilotExpiresAt: number | null = null;
let refreshPromise: Promise<string> | null = null;
const resolvedModelCache = new Map<string, CopilotModelConfig>();

export function setCopilotToken(token: string): void {
  copilotToken = token.trim();
  githubToken = null;
  copilotExpiresAt = null;
  resolvedModelCache.clear();
}

export function setCopilotAuth(state: StoredAuthState): void {
  copilotToken = state.copilotToken?.trim() ?? null;
  githubToken = state.githubToken?.trim() ?? null;
  copilotExpiresAt = state.copilotExpiresAt ?? null;
  resolvedModelCache.clear();
}

export async function connectCopilotAuth(state: StoredAuthState): Promise<void> {
  setCopilotAuth(state);
  if (githubToken) {
    await getToken();
  } else if (!copilotToken) {
    throw new Error('Paste a Copilot token or a refreshable auth bundle.');
  }
}

export function clearCopilotSession(): void {
  copilotToken = null;
  githubToken = null;
  copilotExpiresAt = null;
  refreshPromise = null;
  resolvedModelCache.clear();
}

export async function listAvailableModels(): Promise<CopilotModelMetadata[]> {
  const token = await getToken();
  const res = await fetchWithRetry(
    COPILOT_MODELS_PATH,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': 'vscode/1.96.0',
      },
    },
    'Copilot models lookup',
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Copilot models lookup failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { data?: CopilotModelMetadata[] };
  return data.data ?? [];
}

export async function probeModel(modelConfig: CopilotModelConfig): Promise<CopilotModelProbe> {
  if (isBrowserOnlyBlocked(modelConfig)) {
    return {
      available: false,
      message: 'This model requires a Copilot endpoint that is unavailable from browser-only mode.',
    };
  }

  try {
    const resolved = await completeWithFallback(
      modelConfig,
      [{
        role: 'user',
        content: `In one short sentence, confirm you are working and include the word "ok". (${modelConfig.model})`,
      }],
      probeMaxTokens(modelConfig),
      0.2,
    );

    if (!resolved.text.trim()) {
      return { available: false, message: 'The model returned an empty response during preflight.' };
    }

    resolvedModelCache.set(modelConfig.model, resolved.config);
    return { available: true, resolvedModel: resolved.config.model };
  } catch (error) {
    return { available: false, message: (error as Error).message };
  }
}

export async function* streamCompletion(
  modelConfig: CopilotModelConfig,
  messages: Message[],
  maxTokens = 1200,
  temperature = 0.65,
  onUsage?: (usage: CopilotUsage) => void,
): AsyncGenerator<string, void, unknown> {
  const resolved = await streamWithFallback(modelConfig, messages, maxTokens, temperature, onUsage);
  resolvedModelCache.set(modelConfig.model, resolved.config);

  for (const chunk of resolved.chunks) {
    yield chunk;
  }
}

export async function complete(
  modelConfig: CopilotModelConfig,
  messages: Message[],
  maxTokens = 1200,
  temperature = 0.3,
  onUsage?: (usage: CopilotUsage) => void,
): Promise<string> {
  const resolved = await completeWithFallback(modelConfig, messages, maxTokens, temperature, onUsage);
  resolvedModelCache.set(modelConfig.model, resolved.config);
  return resolved.text.trim();
}

export async function completeDetailed(
  modelConfig: CopilotModelConfig,
  messages: Message[],
  maxTokens = 1200,
  temperature = 0.3,
  onUsage?: (usage: CopilotUsage) => void,
): Promise<{ text: string; model: string }> {
  const resolved = await completeWithFallback(modelConfig, messages, maxTokens, temperature, onUsage);
  resolvedModelCache.set(modelConfig.model, resolved.config);
  return { text: resolved.text.trim(), model: resolved.config.model };
}

async function completeWithFallback(
  modelConfig: CopilotModelConfig,
  messages: Message[],
  maxTokens: number,
  temperature: number,
  onUsage?: (usage: CopilotUsage) => void,
): Promise<{ config: CopilotModelConfig; text: string }> {
  const resolved = await streamWithFallback(modelConfig, messages, maxTokens, temperature, onUsage);
  return {
    config: resolved.config,
    text: resolved.chunks.join(''),
  };
}

async function streamWithFallback(
  modelConfig: CopilotModelConfig,
  messages: Message[],
  maxTokens: number,
  temperature: number,
  onUsage?: (usage: CopilotUsage) => void,
): Promise<{ config: CopilotModelConfig; chunks: string[] }> {
  const token = await getToken();
  const candidates = orderedCandidates(modelConfig);
  const tried = candidates.map((candidate) => candidate.model).join(', ');

  for (const candidate of candidates) {
    if (isBrowserOnlyBlocked(candidate)) {
      continue;
    }

    const { path, body } = buildCopilotRequest(candidate, messages, maxTokens, temperature, true);
    const requestLabel = describeRequest(candidate, path);
    const result = await requestCandidateStream(
      path,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Copilot-Integration-Id': 'vscode-chat',
          'Editor-Version': 'vscode/1.96.0',
          'OpenAI-Intent': 'conversation-panel',
        },
        body: JSON.stringify(body),
      },
      requestLabel,
      candidate !== candidates.at(-1),
    );
    if (result.kind === 'unsupported') continue;
    for (const usage of result.usages) {
      onUsage?.(usage);
    }
    return { config: candidate, chunks: result.chunks };
  }

  throw new Error(`No supported Copilot model available for this request. Tried: ${tried}`);
}

async function collectChunks(body: ReadableStream<Uint8Array>): Promise<{ chunks: string[]; usages: CopilotUsage[] }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamedText = false;
  const chunks: string[] = [];
  const usages = new Map<string, CopilotUsage>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return { chunks, usages: Array.from(usages.values()) };
        try {
          const usage = extractStreamUsage(payload);
          if (usage) usages.set(usage.requestKey, usage);
        } catch {
          // ignore malformed usage frames
        }
        try {
          const chunk = extractStreamText(payload);
          if (!chunk.text) continue;
          if (chunk.final && streamedText) continue;
          streamedText = true;
          chunks.push(chunk.text);
        } catch {
          // ignore malformed SSE frames
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { chunks, usages: Array.from(usages.values()) };
}

async function getToken(): Promise<string> {
  if (githubToken && (!copilotToken || !copilotExpiresAt || Date.now() + 300_000 >= copilotExpiresAt)) {
    return refreshCopilotToken();
  }
  if (!copilotToken) throw new Error('Not connected — paste a Copilot token first.');
  return copilotToken;
}

function orderedCandidates(modelConfig: CopilotModelConfig): CopilotModelConfig[] {
  const cached = resolvedModelCache.get(modelConfig.model);
  if (!cached) return expandModelConfigs(modelConfig);

  const rest = expandModelConfigs(modelConfig).filter((candidate) => candidate.model !== cached.model);
  return [cached, ...rest];
}

function isBrowserOnlyBlocked(modelConfig: CopilotModelConfig): boolean {
  return typeof window !== 'undefined' && modelConfig.endpoint === 'responses';
}

function probeMaxTokens(modelConfig: CopilotModelConfig): number {
  return modelConfig.model.startsWith('gemini-') ? 320 : 120;
}

async function refreshCopilotToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  if (!githubToken) throw new Error('No GitHub token available to refresh the Copilot token.');

  refreshPromise = (async () => {
    const res = await fetchWithRetry(
      'https://api.github.com/copilot_internal/v2/token',
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/json',
        },
      },
      'Copilot token exchange',
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Copilot token exchange failed (${res.status}): ${text}`);
    }

    const data = await res.json() as { token?: string; expires_at?: string | number };
    if (!data.token) {
      throw new Error('Copilot token exchange response was missing token.');
    }

    copilotToken = data.token.trim();
    copilotExpiresAt = data.expires_at == null ? null : parseExpiresAt(data.expires_at);
    saveAuthState({ copilotToken, githubToken, copilotExpiresAt });
    return copilotToken;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function requestCandidateStream(
  path: string,
  init: RequestInit,
  requestLabel: string,
  allowUnsupportedFallback: boolean,
): Promise<
  | { kind: 'success'; chunks: string[]; usages: CopilotUsage[] }
  | { kind: 'unsupported' }
> {
  for (let attempt = 0; attempt <= MODEL_API_RETRY_DELAYS_MS.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(path, init);
    } catch (error) {
      if (attempt === MODEL_API_RETRY_DELAYS_MS.length) {
        throw new Error(`${requestLabel} failed: ${(error as Error).message}`);
      }
      await waitForRetry(MODEL_API_RETRY_DELAYS_MS[attempt]!);
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400 && isModelNotSupportedError(text) && allowUnsupportedFallback) {
        return { kind: 'unsupported' };
      }
      if (shouldRetryModelRequest(res.status) && attempt < MODEL_API_RETRY_DELAYS_MS.length) {
        await waitForRetry(MODEL_API_RETRY_DELAYS_MS[attempt]!);
        continue;
      }
      throw new Error(`${requestLabel} failed (${res.status}): ${text}`);
    }

    if (!res.body) {
      if (attempt === MODEL_API_RETRY_DELAYS_MS.length) {
        throw new Error(`${requestLabel} failed: Response has no body`);
      }
      await waitForRetry(MODEL_API_RETRY_DELAYS_MS[attempt]!);
      continue;
    }

    try {
      const { chunks, usages } = await collectChunks(res.body);
      return { kind: 'success', chunks, usages };
    } catch (error) {
      if (attempt === MODEL_API_RETRY_DELAYS_MS.length) {
        throw new Error(`${requestLabel} stream failed: ${(error as Error).message}`);
      }
      await waitForRetry(MODEL_API_RETRY_DELAYS_MS[attempt]!);
    }
  }

  throw new Error(`${requestLabel} failed after retries.`);
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  for (let attempt = 0; attempt <= MODEL_API_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(input, init);
      if (!res.ok && shouldRetryModelRequest(res.status) && attempt < MODEL_API_RETRY_DELAYS_MS.length) {
        await waitForRetry(MODEL_API_RETRY_DELAYS_MS[attempt]!);
        continue;
      }
      return res;
    } catch (error) {
      if (attempt === MODEL_API_RETRY_DELAYS_MS.length) {
        throw new Error(`${label} failed: ${(error as Error).message}`);
      }
      await waitForRetry(MODEL_API_RETRY_DELAYS_MS[attempt]!);
    }
  }

  throw new Error(`${label} failed after retries.`);
}

export function usageToDisplay(usage: CopilotUsage): {
  requestKey: string;
  model: string;
  aiCredits: number;
  usd: number;
} {
  const aiCredits = usage.nanoAiu / 1_000_000_000;
  return {
    requestKey: usage.requestKey,
    model: usage.model,
    aiCredits,
    usd: nanoAiuToUsd(usage.nanoAiu),
  };
}
