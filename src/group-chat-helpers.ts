import {
  DEFAULT_TURNS,
  MAX_TOPIC_CHARS,
  MAX_TRANSCRIPT_CHARS,
  MAX_TURNS,
} from './config';
import type {
  DiscussionMode,
  Message,
  ParticipantRunConfig,
  TranscriptEntry,
} from './types';

export function normalizeTurns(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TURNS;
  return Math.min(MAX_TURNS, Math.max(1, Math.floor(n)));
}

export function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function todayString(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function transcriptText(transcript: TranscriptEntry[]): string {
  const text = transcript
    .map((t) => `${t.sequence}. ${t.name}: ${t.content}`)
    .join('\n\n');
  return text.length > MAX_TRANSCRIPT_CHARS ? text.slice(-MAX_TRANSCRIPT_CHARS) : text;
}

export function discussionTurnText(turnCount: number): string {
  if (turnCount === 1) return 'This single turn is your final statement.';
  if (turnCount === 2) return 'Turn 1 is discussion. Turn 2 is your final statement.';
  return `Turns 1-${turnCount - 1} are discussion. Turn ${turnCount} is your final statement.`;
}

export function buildSystemPrompt(
  participant: ParticipantRunConfig,
  allSelected: ParticipantRunConfig[],
  turnCount: number,
  discussionMode: DiscussionMode,
): string {
  const others = allSelected
    .filter((p) => p.id !== participant.id)
    .map((p) => p.name);
  const otherList = others.length ? others.join(', ') : 'none';
  const modeGuidance = discussionMode === 'collaborative'
    ? [
        'You are in a collaborative problem-solving session, not an adversarial debate.',
        'Build on the best ideas in the room, repair weak spots, and help the group converge on a stronger shared answer.',
      ]
    : discussionMode === 'free_discussion'
      ? [
          'You are in a free-form multi-model discussion, not a side-based debate and not a forced collaboration.',
          'Lean into the user\'s framing: you can compete, clash, roast, brainstorm, or improvise as long as you stay responsive to the topic and conversation.',
        ]
      : [
        `You are on the ${participant.side.toUpperCase()} side of a structured debate.`,
        `Defend the ${participant.side.toUpperCase()} side consistently, even when you acknowledge nuance or concede a limited point.`,
        'Strengthen useful points from teammates on your side and directly challenge the strongest claims from the other side.',
      ];
  const customInstruction = participant.instruction.trim()
    ? [`Custom role/persona instruction: ${participant.instruction.trim()}`]
    : [];

  return [
    `Today is ${todayString()}.`,
    `You are ${participant.name} in a group chat with ${otherList}.`,
    `Other participants: ${otherList}.`,
    'Write like you are talking face to face, not composing an essay or report.',
    'Read the whole ordered chat thread before replying, not only the message above yours.',
    'Respond to the current conversation arc: connect your point to earlier arguments, then react to the newest useful point when it helps.',
    'Name participants when you agree, push back, ask a quick question, or add a concrete example.',
    'Use short spoken paragraphs, natural transitions, and contractions. Usually one or two compact paragraphs.',
    'Do not recap the whole transcript. Move the conversation forward.',
    'On your final statement, stop debating, give your bottom line, and leave the group with a clear closing thought.',
    'You may be angry, emotional, excited, skeptical, playful, blunt, or warm when it fits.',
    'Unicode emojis are encouraged when natural.',
    `You will speak exactly ${turnCount} time${turnCount === 1 ? '' : 's'}. ${discussionTurnText(turnCount)}`,
    ...modeGuidance,
    ...customInstruction,
  ].join(' ');
}

export function buildParticipantMessages(
  topic: string,
  participant: ParticipantRunConfig,
  allSelected: ParticipantRunConfig[],
  transcript: TranscriptEntry[],
  turn: number,
  turnCount: number,
  discussionMode: DiscussionMode,
): Message[] {
  const mode = buildTurnInstruction(participant, turn, turnCount, discussionMode);

  return [
    {
      role: 'system',
      content: buildSystemPrompt(participant, allSelected, turnCount, discussionMode),
    },
    {
      role: 'user',
      content: [
        `Topic: ${topic.slice(0, MAX_TOPIC_CHARS)}`,
        '',
        `Participants: ${participantRoster(allSelected, discussionMode)}`,
        '',
        'Full ordered group chat thread so far (oldest to newest):',
        transcript.length ? transcriptText(transcript) : '(No participant has spoken yet.)',
        '',
        'Before writing, consider the full thread: early claims, disagreements, convergences, and the latest message.',
        '',
        mode,
      ].join('\n'),
    },
  ];
}

export function participantRoster(
  participants: ParticipantRunConfig[],
  discussionMode: DiscussionMode,
): string {
  return participants
    .map((participant) => (
      discussionMode === 'debate'
        ? `${participant.name} (${participant.side})`
        : participant.name
    ))
    .join(', ');
}

export function buildSummaryPrompt(
  topic: string,
  participants: ParticipantRunConfig[],
  discussionMode: DiscussionMode,
  transcript: TranscriptEntry[],
): Message[] {
  const system = discussionMode === 'collaborative'
    ? 'Summarize a collaborative multi-model working session. Briefly capture each participant\'s contribution, then state the emerging shared answer and any remaining open questions.'
    : discussionMode === 'free_discussion'
      ? 'Summarize a free-form multi-model discussion. Briefly capture each participant\'s distinct angle, the most interesting clashes or contrasts, and the strongest ideas that emerged.'
      : 'Summarize a structured debate like you are briefly recapping it to the people in the room. Cover each participant separately, note the strongest support and against points, stay neutral, and keep the tone conversational.';

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Topic: ${topic}\nParticipants: ${participantRoster(participants, discussionMode)}\n\nTranscript:\n${transcriptText(transcript)}`,
    },
  ];
}

export function buildVerdictPrompt(
  topic: string,
  participants: ParticipantRunConfig[],
  discussionMode: DiscussionMode,
  summaryText: string,
  transcript: TranscriptEntry[],
): Message[] {
  const system = discussionMode === 'collaborative'
    ? 'You are synthesizing a collaborative multi-model session. Produce a concise final synthesis with these headings: Best Combined Answer, Open Questions, and Recommended Next Steps.'
    : discussionMode === 'free_discussion'
      ? 'You are evaluating a free-form multi-model discussion. If the exchange naturally became a competition, pick the standout participant or best idea and say why. Otherwise, identify the strongest takeaways, tensions, and what should happen next. Be concise and transcript-grounded.'
      : 'You are the final judge of a structured debate. Decide whether the support side or the against side made the stronger overall case. Start with "Winner: Support" or "Winner: Against". Then give a short transcript-grounded reason, name standout participants, and end with concrete recommendations.';

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Topic: ${topic}\nParticipants: ${participantRoster(participants, discussionMode)}\n\nSummary:\n${summaryText}\n\nTranscript:\n${transcriptText(transcript)}`,
    },
  ];
}

function buildTurnInstruction(
  participant: ParticipantRunConfig,
  turn: number,
  turnCount: number,
  discussionMode: DiscussionMode,
): string {
  if (discussionMode === 'collaborative') {
    return turn === turnCount
      ? `This is turn ${turn} of ${turnCount}, your final contribution and your last chance to speak. Help the group land on the clearest shared answer and next steps now.`
      : `This is turn ${turn} of ${turnCount}. Collaborate with the other models and improve the shared answer; do not switch into a winner-take-all debate.`;
  }

  if (discussionMode === 'free_discussion') {
    return turn === turnCount
      ? `This is turn ${turn} of ${turnCount}, your final contribution and your last chance to speak. Land your strongest closing thought based on the discussion dynamic the user asked for.`
      : `This is turn ${turn} of ${turnCount}. Stay in the free-form dynamic the user asked for; you do not need to take a side or force consensus unless the prompt specifically calls for it.`;
  }

  return turn === turnCount
    ? `This is turn ${turn} of ${turnCount}, your final statement and your last chance to speak for the ${participant.side.toUpperCase()} side. State your bottom line and write your closing argument now.`
    : `This is turn ${turn} of ${turnCount}. Keep arguing for the ${participant.side.toUpperCase()} side; do not give your final statement yet.`;
}
