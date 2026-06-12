import { describe, expect, it } from 'vitest';

import { buildConversationMarkdown } from '../../src/conversation-export';

describe('conversation export', () => {
  it('renders markdown with debate sides and instructions', () => {
    const markdown = buildConversationMarkdown({
      topic: 'Should we adopt strict review gates?',
      turns: 3,
      discussionMode: 'debate',
      participants: [
        { id: 'alpha', name: 'Alpha', model: 'gpt-5.4', side: 'support', instruction: 'Be practical.' },
        { id: 'beta', name: 'Beta', model: 'claude-sonnet-4.6', side: 'against', instruction: '' },
      ],
      transcript: [
        {
          sequence: 1,
          participant: 'alpha',
          name: 'Alpha',
          model: 'gpt-5.4',
          turn: 1,
          totalTurns: 3,
          content: 'I support the change.',
        },
      ],
      summary: 'Alpha argued for consistency.',
      verdict: 'Winner: Support',
    });

    expect(markdown).toContain('**Mode:** Debate');
    expect(markdown).toContain('Side: Support');
    expect(markdown).toContain('Instruction: Be practical.');
    expect(markdown).toContain('## Judgment');
  });

  it('renders the free-discussion result heading', () => {
    const markdown = buildConversationMarkdown({
      topic: 'Compete for the best vacation idea',
      turns: 2,
      discussionMode: 'free_discussion',
      participants: [
        { id: 'alpha', name: 'Alpha', model: 'gpt-5.4', side: 'support', instruction: '' },
      ],
      transcript: [],
      summary: '',
      verdict: 'Best idea: mountain retreat.',
    });

    expect(markdown).toContain('**Mode:** Free discussion');
    expect(markdown).toContain('## Result');
  });
});
