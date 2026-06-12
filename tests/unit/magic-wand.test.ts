import { describe, expect, it } from 'vitest';

import { isAiRelatedTopic, normalizeMagicWandOutput } from '../../src/magic-wand';

describe('magic wand helpers', () => {
  it('trims quotes and whitespace from generated text', () => {
    expect(normalizeMagicWandOutput('  "Debate the future of cities"  ')).toBe('Debate the future of cities');
  });

  it('flags AI-related generated topics', () => {
    expect(isAiRelatedTopic('Should AI run city planning?')).toBe(true);
    expect(isAiRelatedTopic('Best ways to redesign a neighborhood park')).toBe(false);
  });
});
