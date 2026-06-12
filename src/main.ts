import './style.css';

import { ALL_PARTICIPANTS, DEFAULT_TURNS } from './config';
import { clearAuthState, loadAuthState, normalizeAuthInput, saveAuthState } from './auth';
import { loadChatPreferences, saveChatPreferences } from './chat-preferences';
import { clearCopilotSession, connectCopilotAuth, listAvailableModels } from './copilot';
import { downloadConversationMarkdown } from './conversation-export';
import { runGroupChat } from './group-chat';
import { generateRandomPersona, generateRandomTopic } from './magic-wand';
import { WINDOWS_POWERSHELL_TOKEN_SCRIPT } from './token-guide-content';
import { qs, hide, show, toggle, escapeHtml, renderMarkdown, participantColor, participantInitial, autoScroll } from './ui';
import type { ChatPreferences, ConversationExportData, GroupChatEvent, ParticipantRunConfig } from './types';
let connected = false;
let isRunning = false;
let abortController: AbortController | null = null;
let totalUsd = 0;
let chatPreferences: ChatPreferences = loadChatPreferences(ALL_PARTICIPANTS);
let currentConversation: ConversationExportData | null = null;
const countedUsageKeys = new Set<string>();
const signinBtn      = qs<HTMLButtonElement>('#signin-btn');
const signoutBtn     = qs<HTMLButtonElement>('#signout-btn');
const userInfo       = qs<HTMLDivElement>('#user-info');
const userAvatar     = qs<HTMLImageElement>('#user-avatar');
const userNameEl     = qs<HTMLSpanElement>('#user-name');
const usageTotalEl   = qs<HTMLSpanElement>('#usage-total');
const tokenOnboarding = qs<HTMLElement>('#token-onboarding');
const tokenScriptCopyBtn = qs<HTMLButtonElement>('#token-script-copy-btn');
const windowsTokenScriptEl = qs<HTMLElement>('#windows-token-script');
const tokenInput     = qs<HTMLTextAreaElement>('#token-input');
const tokenSaveBtn   = qs<HTMLButtonElement>('#token-save-btn');
const tokenHintEl    = qs<HTMLParagraphElement>('#token-hint');
const setupPanel     = qs<HTMLElement>('#setup-panel');
const mainEl        = qs<HTMLElement>('main');
const topicInput     = qs<HTMLTextAreaElement>('#topic-input');
const topicWandBtn   = qs<HTMLButtonElement>('#topic-wand-btn');
const checkboxGrid   = qs<HTMLDivElement>('#checkbox-grid');
const discussionModeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="discussion-mode"]'));
const turnsInput     = qs<HTMLInputElement>('#turns-input');
const turnsValue     = qs<HTMLSpanElement>('#turns-value');
const startBtn       = qs<HTMLButtonElement>('#start-btn');
const chatSection    = qs<HTMLElement>('#chat-section');
const chatTopicLabel = qs<HTMLSpanElement>('#chat-topic-label');
const chatMessages   = qs<HTMLDivElement>('#chat-messages');
const exportBtn      = qs<HTMLButtonElement>('#export-btn');
const newChatBtn     = qs<HTMLButtonElement>('#new-chat-btn');
const statusBar      = qs<HTMLDivElement>('#status-bar');
const statusText     = qs<HTMLSpanElement>('#status-text');
const errorBar       = qs<HTMLDivElement>('#error-bar');
const errorText      = qs<HTMLSpanElement>('#error-text');
const summaryPanel   = qs<HTMLDivElement>('#summary-panel');
const summaryPanelTitle = qs<HTMLDivElement>('#summary-panel-title');
const summaryContent = qs<HTMLDivElement>('#summary-content');
const judgePanel     = qs<HTMLDivElement>('#judge-panel');
const judgePanelTitle = qs<HTMLDivElement>('#judge-panel-title');
const judgeContent   = qs<HTMLDivElement>('#judge-content');
const stopBtn        = qs<HTMLButtonElement>('#stop-btn');
function showError(msg: string): void { errorText.textContent = msg; show(errorBar); }
function clearError(): void { hide(errorBar); errorText.textContent = ''; }
function formatUsd(usd: number): string { return usd >= 1 ? usd.toFixed(2) : usd.toFixed(4); }
function resetUsageDisplay(): void {
  totalUsd = 0;
  countedUsageKeys.clear();
  usageTotalEl.textContent = `$${formatUsd(totalUsd)}`;
}
function applyUsage(requestKey: string, usd: number): void {
  if (countedUsageKeys.has(requestKey)) return;
  countedUsageKeys.add(requestKey);
  totalUsd += usd;
  usageTotalEl.textContent = `$${formatUsd(totalUsd)}`;
}
qs<HTMLButtonElement>('#error-dismiss').addEventListener('click', clearError);
function resetTokenHint(): void { tokenHintEl.textContent = 'Paste a Copilot token or a refreshable auth bundle. Browser-only mode uses direct calls to GitHub and GitHub Copilot.'; }
function persistPreferences(): void { saveChatPreferences(chatPreferences); }
function selectedParticipants(): ParticipantRunConfig[] {
  return ALL_PARTICIPANTS.flatMap((participant) => {
    const prefs = chatPreferences.participants[participant.id];
    if (!prefs?.enabled) return [];
    return [{
      ...participant,
      side: prefs.side,
      instruction: prefs.instruction.trim(),
    }];
  });
}
function selectedParticipantError(selected = selectedParticipants()): string | null {
  if (!selected.length) return 'Select at least one participant.';
  if (chatPreferences.discussionMode !== 'debate') return null;
  const sides = new Set(selected.map((participant) => participant.side));
  return sides.size === 2 ? null : 'In debate mode, select at least one support model and one against model.';
}
function updateExportBtn(): void { exportBtn.disabled = !currentConversation || currentConversation.transcript.length === 0; }
function applyDiscussionModeUI(): void {
  const mode = currentConversation?.discussionMode ?? chatPreferences.discussionMode;
  summaryPanelTitle.textContent = '📋 Summary';
  if (mode === 'collaborative') {
    judgePanelTitle.textContent = '🤝 Final synthesis';
    return;
  }
  if (mode === 'free_discussion') {
    judgePanelTitle.textContent = '🏁 Result';
    return;
  }
  judgePanelTitle.textContent = '⚖️ Judgment';
}
function syncSetupFormState(): void {
  topicInput.disabled = isRunning;
  topicWandBtn.disabled = isRunning;
  turnsInput.disabled = isRunning;
  discussionModeInputs.forEach((input) => { input.disabled = isRunning; });
  checkboxGrid.querySelectorAll('input, select, textarea, button').forEach((el) => {
    if (el instanceof HTMLSelectElement) {
      el.disabled = isRunning || chatPreferences.discussionMode !== 'debate';
      return;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement) {
      el.disabled = isRunning;
    }
  });
}
function setConnected(next: boolean): void {
  connected = next;
  toggle(signinBtn, !next);
  toggle(userInfo, next, 'flex');
  toggle(tokenOnboarding, !next);
  setupPanel.classList.toggle('locked', !next);
  if (next) {
    userAvatar.style.display = 'none';
    userAvatar.src = '';
    userNameEl.textContent = 'Copilot token loaded';
  } else {
    userNameEl.textContent = '';
  }
  updateStartBtn();
  syncSetupFormState();
}
function focusTokenInput(): void { tokenInput.scrollIntoView({ block: 'center', behavior: 'smooth' }); tokenInput.focus(); }
async function fillRandomTopic(): Promise<void> {
  topicWandBtn.disabled = true;
  topicWandBtn.textContent = '…';
  clearError();
  try {
    topicInput.value = await generateRandomTopic(chatPreferences.discussionMode);
    updateStartBtn();
  } catch (error) {
    showError(`Topic generation failed: ${(error as Error).message}`);
  } finally {
    topicWandBtn.disabled = false;
    topicWandBtn.textContent = '✨';
  }
}
async function fillRandomPersona(input: HTMLTextAreaElement, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = '…';
  clearError();
  try {
    input.value = await generateRandomPersona(topicInput.value.trim(), chatPreferences.discussionMode);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (error) {
    showError(`Persona generation failed: ${(error as Error).message}`);
  } finally {
    button.disabled = false;
    button.textContent = '✨';
  }
}
async function connectToken(): Promise<void> {
  const authState = normalizeAuthInput(tokenInput.value);
  if (!authState.copilotToken && !authState.githubToken) {
    tokenHintEl.textContent = 'Paste a Copilot token or refreshable auth bundle first.';
    return;
  }
  tokenSaveBtn.disabled = true;
  tokenHintEl.textContent = 'Saving token…';
  clearError();
  try {
    saveAuthState(authState);
    await connectCopilotAuth(authState);
    await listAvailableModels();
    setConnected(true);
    tokenHintEl.textContent = authState.githubToken
      ? 'Refreshable session saved. Copilot tokens will auto-renew.'
      : 'Token saved.';
  } catch (error) {
    clearAuthState();
    clearCopilotSession();
    setConnected(false);
    buildParticipantChips();
    showError(`Connection failed: ${(error as Error).message}`);
    tokenHintEl.textContent = 'Connection failed. Paste a fresh Copilot token or refreshable auth bundle and try again.';
  } finally {
    tokenSaveBtn.disabled = false;
  }
}
signinBtn.addEventListener('click', focusTokenInput);
tokenSaveBtn.addEventListener('click', () => void connectToken());
topicWandBtn.addEventListener('click', () => void fillRandomTopic());
tokenScriptCopyBtn.addEventListener('click', () => {
  void navigator.clipboard.writeText(WINDOWS_POWERSHELL_TOKEN_SCRIPT);
  tokenScriptCopyBtn.textContent = '✓ Copied';
  setTimeout(() => { tokenScriptCopyBtn.textContent = 'Copy PowerShell script'; }, 2000);
});
signoutBtn.addEventListener('click', () => {
  abortController?.abort(); clearAuthState(); clearCopilotSession(); tokenInput.value = ''; resetTokenHint();
  currentConversation = null; updateExportBtn(); mainEl.classList.remove('chat-active'); hide(chatSection); show(setupPanel);
  isRunning = false; resetUsageDisplay(); setConnected(false); buildParticipantChips();
});
function buildParticipantChips(): void {
  checkboxGrid.innerHTML = '';
  for (const participant of ALL_PARTICIPANTS) {
    const prefs = chatPreferences.participants[participant.id];
    const color = participantColor(participant.id);
    const chip = document.createElement('div');
    chip.className = `participant-chip${prefs.enabled ? ' checked' : ''}`;
    chip.style.setProperty('--color', color);
    chip.dataset.id = participant.id;
    chip.innerHTML = `
      <div class="participant-chip-header">
        <label class="participant-toggle">
          <input type="checkbox" ${prefs.enabled ? 'checked' : ''}>
          <span class="chip-dot"></span>
          <span class="participant-labels">
            <span class="participant-name">${escapeHtml(participant.name)}</span>
            <span class="participant-model">${escapeHtml(participant.model)}</span>
          </span>
        </label>
        <label class="participant-side">
          <span>Side</span>
          <select ${chatPreferences.discussionMode === 'debate' ? '' : 'disabled'}>
            <option value="support" ${prefs.side === 'support' ? 'selected' : ''}>Support</option>
            <option value="against" ${prefs.side === 'against' ? 'selected' : ''}>Against</option>
          </select>
        </label>
      </div>
      <label class="participant-instruction">
        <div class="participant-input-header">
          <span>Instruction / persona</span>
          <button type="button" class="btn btn-secondary btn-sm wand-btn" aria-label="Generate a random persona with Haiku">✨</button>
        </div>
        <textarea placeholder="Optional custom role, tone, or persona...">${escapeHtml(prefs.instruction)}</textarea>
      </label>`;

    const checkbox = chip.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const sideSelect = chip.querySelector<HTMLSelectElement>('select')!;
    const wandButton = chip.querySelector<HTMLButtonElement>('button')!;
    const instructionInput = chip.querySelector<HTMLTextAreaElement>('textarea')!;
    checkbox.addEventListener('change', () => {
      prefs.enabled = checkbox.checked;
      chip.classList.toggle('checked', checkbox.checked);
      persistPreferences();
      updateStartBtn();
    });
    sideSelect.addEventListener('change', () => {
      prefs.side = sideSelect.value === 'against' ? 'against' : 'support';
      persistPreferences();
      updateStartBtn();
    });
    instructionInput.addEventListener('input', () => {
      prefs.instruction = instructionInput.value;
      persistPreferences();
    });
    wandButton.addEventListener('click', () => void fillRandomPersona(instructionInput, wandButton));
    checkboxGrid.appendChild(chip);
  }
  updateStartBtn();
  syncSetupFormState();
}
turnsInput.addEventListener('input', () => {
  turnsValue.textContent = turnsInput.value;
  chatPreferences.turns = Number(turnsInput.value);
  persistPreferences();
});
function updateStartBtn(): void {
  const selected = selectedParticipants();
  startBtn.disabled = !(connected && !selectedParticipantError(selected) && topicInput.value.trim().length > 0 && !isRunning);
}
topicInput.addEventListener('input', updateStartBtn);
discussionModeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    chatPreferences.discussionMode =
      input.value === 'collaborative'
        ? 'collaborative'
        : input.value === 'free_discussion'
          ? 'free_discussion'
          : 'debate';
    persistPreferences();
    applyDiscussionModeUI();
    buildParticipantChips();
  });
});
const streamingEls = new Map<string, HTMLDivElement>();
function appendBubble(
  participantId: string, name: string, model: string,
  turn: number, totalTurns: number, streaming: boolean,
): HTMLDivElement {
  const color = participantColor(participantId);
  const initial = participantInitial(name);
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap';
  wrap.dataset.participant = participantId;

  const contentEl = document.createElement('div');
  contentEl.className = `msg-content${streaming ? ' streaming' : ''}`;

  wrap.innerHTML = `
    <div class="msg-avatar" style="background:${escapeHtml(color)}">${escapeHtml(initial)}</div>
    <div class="msg-body">
      <div class="msg-meta">
        <span class="msg-name" style="color:${escapeHtml(color)}">${escapeHtml(name)}</span>
        <span class="msg-model">${escapeHtml(model)}</span>
        <span class="msg-turn">Turn ${turn}/${totalTurns}</span>
      </div>
    </div>`;
  wrap.querySelector('.msg-body')!.appendChild(contentEl);
  chatMessages.appendChild(wrap);
  autoScroll(chatMessages);
  return contentEl;
}
function handleEvent(event: GroupChatEvent): void {
  switch (event.type) {
    case 'streaming_start': {
      const el = appendBubble(
        event.participant, event.name, event.model, event.turn, event.totalTurns, true,
      );
      el.textContent = '';
      streamingEls.set(event.participant, el);
      statusText.textContent = `${event.name} is typing…`;
      break;
    }
    case 'delta': {
      const el = streamingEls.get(event.participant);
      if (el) {
        el.textContent = (el.textContent ?? '') + event.text;
        autoScroll(chatMessages);
      }
      break;
    }
    case 'message': {
      const el = streamingEls.get(event.message.participant);
      if (el) {
        el.classList.remove('streaming');
        el.innerHTML = renderMarkdown(event.message.content);
        streamingEls.delete(event.message.participant);
      }
      currentConversation?.transcript.push(event.message);
      updateExportBtn();
      autoScroll(chatMessages);
      break;
    }
    case 'usage':
      applyUsage(event.requestKey, event.usd);
      break;
    case 'summary_start':
      show(summaryPanel);
      summaryContent.innerHTML = '<div class="thinking"><div class="spinner"></div> Summarizing…</div>';
      statusText.textContent = 'Writing summary…';
      break;
    case 'summary':
      summaryPanelTitle.textContent = `📋 Summary · ${event.model}`;
      summaryContent.innerHTML = renderMarkdown(event.text);
      if (currentConversation) currentConversation.summary = event.text;
      autoScroll(chatMessages);
      break;
    case 'judge_start':
      show(judgePanel);
      judgeContent.innerHTML = currentConversation?.discussionMode === 'collaborative'
        ? '<div class="thinking"><div class="spinner"></div> Synthesizing…</div>'
        : currentConversation?.discussionMode === 'free_discussion'
          ? '<div class="thinking"><div class="spinner"></div> Evaluating…</div>'
          : '<div class="thinking"><div class="spinner"></div> Judging…</div>';
      statusText.textContent = currentConversation?.discussionMode === 'collaborative'
        ? 'Writing final synthesis…'
        : currentConversation?.discussionMode === 'free_discussion'
          ? 'Evaluating the discussion…'
          : 'Judging the debate…';
      break;
    case 'judge':
      judgePanelTitle.textContent = `${judgePanelTitle.textContent.split(' · ')[0]} · ${event.model}`;
      judgeContent.innerHTML = renderMarkdown(event.text);
      if (currentConversation) currentConversation.verdict = event.text;
      updateExportBtn();
      autoScroll(chatMessages);
      break;
    case 'error':
      showError(event.message);
      break;
  }
}
async function startChat(): Promise<void> {
  clearError();
  const topic = topicInput.value.trim();
  if (!topic || !connected) return;
  const participants = selectedParticipants();
  const selectionError = selectedParticipantError(participants);
  if (selectionError) {
    showError(selectionError);
    return;
  }
  isRunning = true;
  updateStartBtn();
  syncSetupFormState();
  mainEl.classList.add('chat-active');
  show(chatSection);
  chatMessages.innerHTML = '';
  hide(summaryPanel);
  hide(judgePanel);
  streamingEls.clear();
  resetUsageDisplay();
  currentConversation = {
    topic,
    turns: Number(turnsInput.value),
    discussionMode: chatPreferences.discussionMode,
    participants,
    transcript: [],
    summary: '',
    verdict: '',
  };
  applyDiscussionModeUI();
  updateExportBtn();

  chatTopicLabel.innerHTML = `<strong>Topic:</strong> ${escapeHtml(topic)}`;
  show(statusBar);
  show(stopBtn);
  statusText.textContent = 'Starting…';
  abortController = new AbortController();
  try {
    await runGroupChat(
      {
        topic,
        turns: Number(turnsInput.value),
        discussionMode: chatPreferences.discussionMode,
        participants,
      },
      handleEvent,
      abortController.signal,
    );
    statusText.textContent = '✓ Done';
    setTimeout(() => hide(statusBar), 3000);
  } catch (error) {
    const message = (error as Error).message;
    if (message !== 'Aborted') showError(`Chat error: ${message}`);
    statusText.textContent = 'Stopped.';
  } finally {
    isRunning = false;
    abortController = null;
    hide(stopBtn);
    updateStartBtn();
    syncSetupFormState();
  }
}
startBtn.addEventListener('click', () => void startChat());
exportBtn.addEventListener('click', () => { if (currentConversation) downloadConversationMarkdown(currentConversation); });
stopBtn.addEventListener('click', () => {
  abortController?.abort();
  statusText.textContent = 'Stopping…';
});
newChatBtn.addEventListener('click', () => {
  abortController?.abort();
  mainEl.classList.remove('chat-active');
  hide(chatSection);
  clearError();
  isRunning = false;
  currentConversation = null;
  resetUsageDisplay();
  updateExportBtn();
  updateStartBtn();
  syncSetupFormState();
});
function boot(): void {
  buildParticipantChips();
  turnsInput.value = String(chatPreferences.turns || DEFAULT_TURNS);
  turnsValue.textContent = String(chatPreferences.turns || DEFAULT_TURNS);
  discussionModeInputs.forEach((input) => { input.checked = input.value === chatPreferences.discussionMode; });
  setConnected(false);
  resetUsageDisplay();
  resetTokenHint();
  windowsTokenScriptEl.textContent = WINDOWS_POWERSHELL_TOKEN_SCRIPT;
  applyDiscussionModeUI();
  updateExportBtn();
  mainEl.classList.remove('chat-active');
  syncSetupFormState();
  const stored = loadAuthState();
  tokenInput.value = stored ? JSON.stringify(stored) : '';
  if (!stored) return;
  void connectCopilotAuth(stored).then(() => setConnected(true)).catch(() => {
    clearAuthState(); clearCopilotSession(); tokenInput.value = ''; setConnected(false);
  });
}
boot();
