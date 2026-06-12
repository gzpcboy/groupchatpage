import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  participantColor,
  participantInitial,
  renderMarkdown,
} from '../../src/ui';

describe('ui helpers', () => {
  it('escapes HTML-sensitive characters', () => {
    expect(escapeHtml('<button "quoted"> & text')).toBe(
      '&lt;button &quot;quoted&quot;&gt; &amp; text',
    );
  });

  it('renders markdown but strips unsafe HTML', () => {
    const html = renderMarkdown('Hello **world**<script>alert(1)</script>');
    expect(html).toContain('<strong>world</strong>');
    expect(html).not.toContain('<script>');
  });

  it('returns participant colors and initials with safe fallbacks', () => {
    expect(participantColor('gpt54')).toMatch(/^#/);
    expect(participantColor('missing')).toBe('#8b949e');
    expect(participantInitial('sonnet')).toBe('S');
  });
});
