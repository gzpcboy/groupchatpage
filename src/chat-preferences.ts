import { DEFAULT_TURNS, MAX_TURNS } from './config';
import type {
  ChatPreferences,
  DiscussionMode,
  Participant,
  ParticipantCustomization,
} from './types';

const CHAT_PREFERENCES_KEY = 'groupchat_preferences_v1';

export function defaultParticipantCustomization(): ParticipantCustomization {
  return {
    enabled: true,
    side: 'support',
    instruction: '',
  };
}

export function createDefaultChatPreferences(participants: Participant[]): ChatPreferences {
  return {
    discussionMode: 'debate',
    turns: DEFAULT_TURNS,
    participants: Object.fromEntries(
      participants.map((participant, index) => [
        participant.id,
        {
          ...defaultParticipantCustomization(),
          side: index % 2 === 0 ? 'support' : 'against',
        },
      ]),
    ),
  };
}

export function loadChatPreferences(participants: Participant[]): ChatPreferences {
  const fallback = createDefaultChatPreferences(participants);
  const raw = localStorage.getItem(CHAT_PREFERENCES_KEY);
  if (!raw) return fallback;

  try {
    return normalizeChatPreferences(JSON.parse(raw), participants, fallback);
  } catch {
    return fallback;
  }
}

export function saveChatPreferences(preferences: ChatPreferences): void {
  localStorage.setItem(CHAT_PREFERENCES_KEY, JSON.stringify(preferences));
}

function normalizeChatPreferences(
  raw: unknown,
  participants: Participant[],
  fallback: ChatPreferences,
): ChatPreferences {
  const base = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  return {
    discussionMode: normalizeDiscussionMode(base.discussionMode),
    turns: normalizeTurns(base.turns),
    participants: Object.fromEntries(
      participants.map((participant) => {
        const participantRaw =
          typeof base.participants === 'object' && base.participants !== null
            ? (base.participants as Record<string, unknown>)[participant.id]
            : null;
        return [participant.id, normalizeParticipantCustomization(participantRaw, fallback.participants[participant.id])];
      }),
    ),
  };
}

function normalizeDiscussionMode(value: unknown): DiscussionMode {
  if (value === 'collaborative' || value === 'free_discussion') return value;
  return 'debate';
}

function normalizeTurns(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TURNS;
  return Math.min(MAX_TURNS, Math.max(1, Math.floor(n)));
}

function normalizeParticipantCustomization(
  raw: unknown,
  fallback: ParticipantCustomization,
): ParticipantCustomization {
  const base = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  return {
    enabled: typeof base.enabled === 'boolean' ? base.enabled : fallback.enabled,
    side: base.side === 'against' ? 'against' : 'support',
    instruction: typeof base.instruction === 'string' ? base.instruction : fallback.instruction,
  };
}
