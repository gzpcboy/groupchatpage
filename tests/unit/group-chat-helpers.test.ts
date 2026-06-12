import { describe, expect, it } from 'vitest';

import {
  buildParticipantMessages,
  buildSystemPrompt,
  buildVerdictPrompt,
  discussionTurnText,
  normalizeTurns,
  transcriptText,
} from '../../src/group-chat-helpers';
import type { ParticipantRunConfig, TranscriptEntry } from '../../src/types';

const participants: ParticipantRunConfig[] = [
  { id: 'alpha', name: 'Alpha', model: 'gpt-5.4', side: 'support', instruction: '' },
  { id: 'beta', name: 'Beta', model: 'claude-sonnet-4.6', side: 'against', instruction: 'Be blunt.' },
];

describe('group-chat helpers', () => {
  it('clamps and normalizes turn counts', () => {
    expect(normalizeTurns('3.8')).toBe(3);
    expect(normalizeTurns(0)).toBe(1);
    expect(normalizeTurns(999)).toBe(10);
    expect(normalizeTurns('nope')).toBe(3);
  });

  it('describes discussion and final-turn guidance', () => {
    expect(discussionTurnText(1)).toContain('single turn');
    expect(discussionTurnText(2)).toContain('Turn 2 is your final statement');
    expect(discussionTurnText(5)).toContain('Turn 5 is your final statement');
  });

  it('builds a prompt that references the other participants', () => {
    const prompt = buildSystemPrompt(participants[0], participants, 2, 'debate');
    expect(prompt).toContain('You are Alpha');
    expect(prompt).toContain('Beta');
    expect(prompt).toContain('SUPPORT');
    expect(prompt).toContain('Turn 2 is your final statement');
  });

  it('builds participant messages with transcript context and final-turn mode', () => {
    const transcript: TranscriptEntry[] = [
      {
        sequence: 1,
        participant: 'beta',
        name: 'Beta',
        model: 'claude-sonnet-4.6',
        turn: 1,
        totalTurns: 2,
        content: 'I disagree with the premise.',
      },
    ];

    const messages = buildParticipantMessages(
      'Should AI code reviews be mandatory?',
      participants[0],
      participants,
      transcript,
      2,
      2,
      'debate',
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('Alpha');
    expect(messages[0]?.content).toContain('SUPPORT');
    expect(messages[1]?.content).toContain('Topic: Should AI code reviews be mandatory?');
    expect(messages[1]?.content).toContain('1. Beta: I disagree with the premise.');
    expect(messages[1]?.content).toContain('your final statement');
    expect(messages[1]?.content).toContain('last chance to speak');
  });

  it('adds collaborative and persona guidance when requested', () => {
    const messages = buildParticipantMessages(
      'How should we ship this feature?',
      participants[1],
      participants,
      [],
      1,
      3,
      'collaborative',
    );

    expect(messages[0]?.content).toContain('collaborative problem-solving session');
    expect(messages[0]?.content).toContain('Be blunt.');
    expect(messages[1]?.content).toContain('Collaborate with the other models');
  });

  it('supports a free-discussion mode without forcing sides or consensus', () => {
    const messages = buildParticipantMessages(
      'Pitch the best vacation idea and compete for the win.',
      participants[0],
      participants,
      [],
      1,
      2,
      'free_discussion',
    );

    expect(messages[0]?.content).toContain('free-form multi-model discussion');
    expect(messages[1]?.content).toContain('you do not need to take a side or force consensus');
  });

  it('builds a verdict prompt that can judge sides instead of only people', () => {
    const messages = buildVerdictPrompt(
      'Should we do X?',
      participants,
      'debate',
      'Support had the stronger evidence.',
      [],
    );

    expect(messages[0]?.content).toContain('Winner: Support');
    expect(messages[1]?.content).toContain('Alpha (support)');
    expect(messages[1]?.content).toContain('Beta (against)');
  });

  it('truncates transcript text from the tail when it gets too long', () => {
    const longEntry = 'x'.repeat(25_000);
    const transcript: TranscriptEntry[] = [
      {
        sequence: 1,
        participant: 'alpha',
        name: 'Alpha',
        model: 'gpt-5.4',
        turn: 1,
        totalTurns: 1,
        content: longEntry,
      },
    ];

    const result = transcriptText(transcript);
    expect(result.length).toBe(24_000);
    expect(result.endsWith('x'.repeat(50))).toBe(true);
  });
});
