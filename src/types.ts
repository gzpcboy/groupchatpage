// ── Copilot API ───────────────────────────────────────────────────────────────

export type CopilotEndpoint = 'chat_completions' | 'responses';
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type MaxTokensParameter = 'max_tokens' | 'max_completion_tokens' | 'max_output_tokens';

export interface CopilotModelConfig {
  model: string;
  modelCandidates?: string[];
  endpoint?: CopilotEndpoint;
  reasoningEffort?: ReasoningEffort;
  maxTokensParameter?: MaxTokensParameter;
  temperature?: number | null;
}

export interface CopilotModelMetadata {
  id: string;
  name?: string;
  supported_endpoints?: string[];
}

export interface CopilotModelProbe {
  available: boolean;
  resolvedModel?: string;
  message?: string;
}

export interface CopilotUsage {
  requestKey: string;
  model: string;
  nanoAiu: number;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface Participant extends CopilotModelConfig {
  id: string;
  name: string;
}

export type DiscussionMode = 'debate' | 'collaborative' | 'free_discussion';
export type DebateSide = 'support' | 'against';

export interface ParticipantCustomization {
  enabled: boolean;
  side: DebateSide;
  instruction: string;
}

export interface ChatPreferences {
  discussionMode: DiscussionMode;
  turns: number;
  participants: Record<string, ParticipantCustomization>;
}

export interface ParticipantRunConfig extends Participant {
  side: DebateSide;
  instruction: string;
}

export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
}

export interface TranscriptEntry {
  sequence: number;
  participant: string;
  name: string;
  model: string;
  turn: number;
  totalTurns: number;
  content: string;
}

// ── Group-chat events emitted while running ───────────────────────────────────

export type GroupChatEvent =
  | { type: 'streaming_start'; participant: string; name: string; model: string; turn: number; totalTurns: number }
  | { type: 'delta'; participant: string; text: string }
  | { type: 'message'; message: TranscriptEntry }
  | { type: 'usage'; requestKey: string; model: string; usd: number; aiCredits: number }
  | { type: 'summary_start' }
  | { type: 'summary'; text: string; model: string }
  | { type: 'judge_start' }
  | { type: 'judge'; text: string; model: string }
  | { type: 'error'; message: string };

export type EmitFn = (event: GroupChatEvent) => void;

export interface ConversationExportData {
  topic: string;
  turns: number;
  discussionMode: DiscussionMode;
  participants: ParticipantRunConfig[];
  transcript: TranscriptEntry[];
  summary: string;
  verdict: string;
}
