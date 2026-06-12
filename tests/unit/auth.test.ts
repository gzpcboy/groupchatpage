import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearAuthState,
  clearToken,
  loadAuthState,
  loadToken,
  normalizeAuthInput,
  normalizeToken,
  saveAuthState,
  saveToken,
} from '../../src/auth';

describe('auth helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and clears the GitHub token in localStorage', () => {
    saveToken('secret-token');
    expect(loadToken()).toBe('secret-token');

    clearToken();
    expect(loadToken()).toBeNull();
  });

  it('normalizes pasted Copilot tokens', () => {
    expect(normalizeToken('  token-123  \n')).toBe('token-123');
  });

  it('parses a refreshable auth bundle', () => {
    expect(normalizeAuthInput('{"github_token":"ghu_123","copilot_token":"cop_456","copilot_expires_at":123456}')).toEqual({
      githubToken: 'ghu_123',
      copilotToken: 'cop_456',
      copilotExpiresAt: 123456,
    });
  });

  it('stores and loads refreshable auth state', () => {
    saveAuthState({ githubToken: 'ghu_123', copilotToken: 'cop_456', copilotExpiresAt: 123456 });
    expect(loadAuthState()).toEqual({
      githubToken: 'ghu_123',
      copilotToken: 'cop_456',
      copilotExpiresAt: 123456,
    });

    clearAuthState();
    expect(loadAuthState()).toBeNull();
  });
});
