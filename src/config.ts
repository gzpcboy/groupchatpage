/// <reference types="vite/client" />
import type { CopilotModelConfig, Participant } from './types';

// No client_id config needed — it's baked into auth.ts (GitHub CLI public client_id).
// All available group-chat participants (all served by Copilot API).
// Models must be available on the user's GitHub Copilot plan.
export const ALL_PARTICIPANTS: Participant[] = [
  {
    id: 'gpt54',
    name: 'GPT-5.4 (medium)',
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
    maxTokensParameter: 'max_completion_tokens',
    temperature: null,
  },
  {
    id: 'gemini31pro',
    name: 'Gemini 3.1 Pro',
    model: 'gemini-3.1-pro-preview',
    modelCandidates: ['gemini-2.5-pro', 'gemini-3.5-flash'],
  },
  {
    id: 'sonnet46',
    name: 'Claude Sonnet 4.6 (medium)',
    model: 'claude-sonnet-4.6',
    modelCandidates: ['claude-sonnet-4-6', 'claude-sonnet-4.5', 'claude-sonnet-4-5'],
    reasoningEffort: 'medium',
  },
  {
    id: 'haiku45',
    name: 'Claude Haiku 4.5',
    model: 'claude-haiku-4.5',
  },
];

// Model used to write the discussion summary (fast, cheap).
export const SUMMARY_MODEL: CopilotModelConfig = {
  model: 'gpt-5.4',
  reasoningEffort: 'medium',
  maxTokensParameter: 'max_completion_tokens',
  temperature: null,
};

// Model used to judge and pick a winner (best reasoning).
export const JUDGE_MODEL: CopilotModelConfig = {
  model: 'claude-opus-4.6',
  modelCandidates: ['claude-opus-4-6', 'claude-opus-4.5', 'claude-opus-4-5'],
  reasoningEffort: 'medium',
};

export const MAX_TURNS = 10;
export const DEFAULT_TURNS = 3;
export const MAX_TOPIC_CHARS = 4000;
export const MAX_TRANSCRIPT_CHARS = 24000;

// One color per participant slot (indexed by ALL_PARTICIPANTS order).
export const PARTICIPANT_COLORS = [
  '#388bfd', // GPT-5.4      — blue
  '#8b949e', // Gemini 3.1   — gray
  '#da7a34', // Sonnet 4.6   — orange
  '#3fb950', // Haiku 4.5    — green
];
