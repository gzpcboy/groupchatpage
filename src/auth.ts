const TOKEN_KEY = 'copilot_access_token';
const AUTH_STATE_KEY = 'copilot_auth_state';

export interface StoredAuthState {
  copilotToken?: string;
  githubToken?: string;
  copilotExpiresAt?: number | null;
}

export function loadAuthState(): StoredAuthState | null {
  const raw = localStorage.getItem(AUTH_STATE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredAuthState;
      if (parsed.copilotToken || parsed.githubToken) return parsed;
    } catch {
      // ignore malformed stored state and fall through to legacy token storage
    }
  }

  const legacyToken = localStorage.getItem(TOKEN_KEY);
  return legacyToken ? { copilotToken: legacyToken } : null;
}

export function saveAuthState(state: StoredAuthState): void {
  localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(state));
  if (state.copilotToken) {
    localStorage.setItem(TOKEN_KEY, state.copilotToken);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearAuthState(): void {
  localStorage.removeItem(AUTH_STATE_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function loadToken(): string | null {
  return loadAuthState()?.copilotToken ?? null;
}

export function saveToken(token: string): void {
  saveAuthState({ copilotToken: token });
}

export function clearToken(): void {
  clearAuthState();
}

export function normalizeToken(input: string): string {
  return input.trim();
}

export function normalizeAuthInput(input: string): StoredAuthState {
  const trimmed = input.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const copilotToken = stringOrUndefined(parsed.copilot_token ?? parsed.copilotToken ?? parsed.token);
    const githubToken = stringOrUndefined(parsed.github_token ?? parsed.githubToken);
    const copilotExpiresAt = numberOrNull(parsed.copilot_expires_at ?? parsed.copilotExpiresAt ?? parsed.expires_at);
    return { copilotToken, githubToken, copilotExpiresAt };
  } catch {
    return { copilotToken: trimmed };
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberOrNull(value: unknown): number | null | undefined {
  if (value == null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
