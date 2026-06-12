import { beforeEach, describe, expect, it } from 'vitest';

import {
  createDefaultChatPreferences,
  loadChatPreferences,
  saveChatPreferences,
} from '../../src/chat-preferences';
import type { Participant } from '../../src/types';

const participants: Participant[] = [
  { id: 'alpha', name: 'Alpha', model: 'gpt-5.4' },
  { id: 'beta', name: 'Beta', model: 'claude-sonnet-4.6' },
];

describe('chat preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates alternating default debate sides', () => {
    const prefs = createDefaultChatPreferences(participants);

    expect(prefs.discussionMode).toBe('debate');
    expect(prefs.participants.alpha?.side).toBe('support');
    expect(prefs.participants.beta?.side).toBe('against');
  });

  it('loads and normalizes saved preferences from localStorage', () => {
    saveChatPreferences({
      discussionMode: 'free_discussion',
      turns: 99,
      participants: {
        alpha: { enabled: false, side: 'against', instruction: 'Be terse.' },
        beta: { enabled: true, side: 'support', instruction: 'Ask questions.' },
      },
    });

    const prefs = loadChatPreferences(participants);

    expect(prefs.discussionMode).toBe('free_discussion');
    expect(prefs.turns).toBe(10);
    expect(prefs.participants.alpha?.enabled).toBe(false);
    expect(prefs.participants.alpha?.side).toBe('against');
  });
});
