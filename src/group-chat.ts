/**
 * group-chat.ts — browser port of mynotebook's src/llm/group-chat.js
 *
 * All LLM calls go through copilot.ts (no backend). The emit callback streams
 * events to the UI as they happen so the user sees each participant type live.
 */

import { streamCompletion, completeDetailed, usageToDisplay } from './copilot';
import {
  SUMMARY_MODEL,
  JUDGE_MODEL,
} from './config';
import type {
  DiscussionMode,
  EmitFn,
  ParticipantRunConfig,
  TranscriptEntry,
} from './types';
import {
  buildParticipantMessages,
  buildSummaryPrompt,
  buildVerdictPrompt,
  normalizeTurns,
  shuffled,
} from './group-chat-helpers';

// ── Main export ───────────────────────────────────────────────────────────────

export interface RunGroupChatInput {
  topic: string;
  turns: number | string;
  discussionMode: DiscussionMode;
  participants: ParticipantRunConfig[];
}

/**
 * Runs a full group chat and streams events to the emit callback.
 * Calling code should pass an AbortSignal to allow cancellation.
 */
export async function runGroupChat(
  input: RunGroupChatInput,
  emit: EmitFn,
  signal?: AbortSignal,
): Promise<void> {
  const topic = String(input.topic ?? '').trim();
  if (!topic) throw new Error('Topic is required.');

  const turnCount = normalizeTurns(input.turns);
  const selected = input.participants;
  if (!selected.length) throw new Error('Select at least one participant.');

  const transcript: TranscriptEntry[] = [];
  let sequence = 0;

  const emitUsage = (usage: { requestKey: string; model: string; nanoAiu: number }): void => {
    const next = usageToDisplay(usage);
    emit({
      type: 'usage',
      requestKey: next.requestKey,
      model: next.model,
      usd: next.usd,
      aiCredits: next.aiCredits,
    });
  };

  // ── Discussion turns ──────────────────────────────────────────────────────
  for (let turn = 1; turn <= turnCount; turn++) {
    if (signal?.aborted) return;

    const roundOrder = shuffled(selected);

    for (const participant of roundOrder) {
      if (signal?.aborted) return;
      const activeParticipant = participant;

      emit({
        type: 'streaming_start',
        participant: activeParticipant.id,
        name: activeParticipant.name,
        model: activeParticipant.model,
        turn,
        totalTurns: turnCount,
      });

      const messages = buildParticipantMessages(
        topic,
        activeParticipant,
        selected,
        transcript,
        turn,
        turnCount,
        input.discussionMode,
      );

      let content = '';
      for await (const chunk of streamCompletion(activeParticipant, messages, 1200, 0.65, emitUsage)) {
        if (signal?.aborted) return;
        content += chunk;
        emit({ type: 'delta', participant: activeParticipant.id, text: chunk });
      }

      if (!content.trim()) content = `${activeParticipant.name} returned an empty message.`;

      const entry: TranscriptEntry = {
        sequence: ++sequence,
        participant: activeParticipant.id,
        name: activeParticipant.name,
        model: activeParticipant.model,
        turn,
        totalTurns: turnCount,
        content: content.trim(),
      };

      transcript.push(entry);
      emit({ type: 'message', message: entry });
    }
  }

  if (signal?.aborted) return;

  // ── Summary ───────────────────────────────────────────────────────────────
  emit({ type: 'summary_start' });
  const summaryResult = await completeDetailed(
    SUMMARY_MODEL,
    buildSummaryPrompt(topic, selected, input.discussionMode, transcript),
    1400,
    0.3,
    emitUsage,
  );
  const summaryText = summaryResult.text;

  emit({ type: 'summary', text: summaryText, model: summaryResult.model });

  if (signal?.aborted) return;

  // ── Judgment ──────────────────────────────────────────────────────────────
  emit({ type: 'judge_start' });

  const judgmentResult = await completeDetailed(
    JUDGE_MODEL,
    buildVerdictPrompt(topic, selected, input.discussionMode, summaryText, transcript),
    1200,
    0.3,
    emitUsage,
  );
  const judgmentText = judgmentResult.text;

  emit({ type: 'judge', text: judgmentText, model: judgmentResult.model });
}
