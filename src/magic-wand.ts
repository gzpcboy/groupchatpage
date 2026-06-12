import { complete } from './copilot';
import type { CopilotModelConfig, DiscussionMode } from './types';

const HAIKU_WAND_MODEL: CopilotModelConfig = {
  model: 'claude-haiku-4.5',
  modelCandidates: ['claude-haiku-4-5'],
};
const AI_TOPIC_PATTERN = /\b(ai|artificial intelligence|machine learning|llm|llms|chatgpt|copilot|openai|anthropic|gemini|claude|neural network|robot|robots)\b/i;

export async function generateRandomTopic(mode: DiscussionMode): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await complete(
      HAIKU_WAND_MODEL,
      [
        {
          role: 'system',
          content: 'You invent random discussion prompts for AI panels. The topic must never be about AI, machine learning, LLMs, robots, software agents, or related technology. Return exactly one concise topic or prompt, with no bullets, no quotes, and no extra explanation.',
        },
        {
          role: 'user',
          content: `Generate one fresh random topic for a ${displayMode(mode)} among multiple AI models. It must be about anything except AI or adjacent technology.`,
        },
      ],
      120,
      0.9,
    );
    const normalized = normalizeMagicWandOutput(text);
    if (!isAiRelatedTopic(normalized)) return normalized;
  }
  throw new Error('Haiku kept returning AI-related topics. Please try again.');
}

export async function generateRandomPersona(topic: string, mode: DiscussionMode): Promise<string> {
  const text = await complete(
    HAIKU_WAND_MODEL,
    [
      {
        role: 'system',
        content: 'You invent short AI persona instructions for multi-model discussions. Return exactly one direct instruction in one or two sentences, with no label, no bullets, and no surrounding quotes.',
      },
      {
        role: 'user',
        content: topic
          ? `Generate one random persona instruction for a participant in a ${displayMode(mode)} about: ${topic}`
          : `Generate one random persona instruction for a participant in a ${displayMode(mode)}.`,
      },
    ],
    140,
    0.9,
  );
  return normalizeMagicWandOutput(text);
}

export function normalizeMagicWandOutput(text: string): string {
  return text.trim().replace(/^["'\s]+|["'\s]+$/g, '').trim();
}

export function isAiRelatedTopic(text: string): boolean {
  return AI_TOPIC_PATTERN.test(text);
}

function displayMode(mode: DiscussionMode): string {
  if (mode === 'collaborative') return 'collaborative discussion';
  if (mode === 'free_discussion') return 'free-form discussion';
  return 'debate';
}
