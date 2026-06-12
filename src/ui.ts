/**
 * ui.ts — lightweight DOM helpers, markdown rendering, and participant colors.
 * No framework, just typed wrappers around the browser DOM.
 */

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { ALL_PARTICIPANTS, PARTICIPANT_COLORS } from './config';

// ── Query shortcuts ───────────────────────────────────────────────────────────

export function qs<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

export function qsAll<T extends HTMLElement>(selector: string): NodeListOf<T> {
  return document.querySelectorAll<T>(selector);
}

// ── Visibility ────────────────────────────────────────────────────────────────

export function show(el: HTMLElement, display = ''): void {
  el.style.display = display || '';
}

export function hide(el: HTMLElement): void {
  el.style.display = 'none';
}

export function toggle(el: HTMLElement, visible: boolean, display = ''): void {
  el.style.display = visible ? display || '' : 'none';
}

// ── Text helpers ──────────────────────────────────────────────────────────────

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

// ── Participant colors ────────────────────────────────────────────────────────

const colorByParticipantId: Record<string, string> = Object.fromEntries(
  ALL_PARTICIPANTS.map((p, i) => [p.id, PARTICIPANT_COLORS[i] ?? '#8b949e']),
);

export function participantColor(participantId: string): string {
  return colorByParticipantId[participantId] ?? '#8b949e';
}

export function participantInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// ── Scroll helpers ────────────────────────────────────────────────────────────

export function scrollToBottom(el: HTMLElement): void {
  el.scrollTop = el.scrollHeight;
}

export function autoScroll(container: HTMLElement): void {
  const threshold = 120; // px from bottom to consider "at bottom"
  const atBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  if (atBottom) scrollToBottom(container);
}
