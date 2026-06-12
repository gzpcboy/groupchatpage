import type { ConversationExportData, DiscussionMode, ParticipantRunConfig } from './types';

export function buildConversationMarkdown(data: ConversationExportData): string {
  const sections = [
    '# GroupChat conversation',
    '',
    `- **Topic:** ${data.topic}`,
    `- **Mode:** ${displayMode(data.discussionMode)}`,
    `- **Turns:** ${data.turns}`,
    `- **Exported:** ${new Date().toLocaleString()}`,
    '',
    '## Participants',
    '',
    ...participantLines(data.participants, data.discussionMode),
    '',
    '## Transcript',
    '',
    ...transcriptLines(data),
    '',
    '## Summary',
    '',
    data.summary || '_No summary generated._',
    '',
    verdictHeading(data.discussionMode),
    '',
    data.verdict || '_No final result generated._',
    '',
  ];
  return sections.join('\n');
}

export function downloadConversationMarkdown(data: ConversationExportData): void {
  const blob = new Blob([buildConversationMarkdown(data)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slugify(data.topic)}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function participantLines(
  participants: ParticipantRunConfig[],
  discussionMode: DiscussionMode,
): string[] {
  return participants.flatMap((participant) => {
    const lines = [
      `- **${participant.name}** (\`${participant.model}\`)`,
      discussionMode === 'debate'
        ? `  - Side: ${capitalize(participant.side)}`
        : discussionMode === 'collaborative'
          ? '  - Role: Collaborative contributor'
          : '  - Role: Free-discussion participant',
    ];
    if (participant.instruction.trim()) {
      lines.push(`  - Instruction: ${participant.instruction.trim()}`);
    }
    return lines;
  });
}

function transcriptLines(data: ConversationExportData): string[] {
  if (!data.transcript.length) return ['_No transcript messages yet._'];
  return data.transcript.flatMap((entry) => {
    const participant = data.participants.find((candidate) => candidate.id === entry.participant);
    const side = data.discussionMode === 'debate' && participant ? ` — ${capitalize(participant.side)}` : '';
    return [
      `### Turn ${entry.turn}/${entry.totalTurns} — ${entry.name}${side}`,
      '',
      entry.content,
      '',
    ];
  });
}

function displayMode(mode: DiscussionMode): string {
  if (mode === 'collaborative') return 'Collaborative';
  if (mode === 'free_discussion') return 'Free discussion';
  return 'Debate';
}

function verdictHeading(mode: DiscussionMode): string {
  if (mode === 'collaborative') return '## Final synthesis';
  if (mode === 'free_discussion') return '## Result';
  return '## Judgment';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function slugify(topic: string): string {
  const base = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base ? `groupchat-${base}` : 'groupchat-conversation';
}
