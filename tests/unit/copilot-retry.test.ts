import { describe, expect, it } from 'vitest';

import { shouldRetryModelRequest } from '../../src/copilot-retry';

describe('copilot retry helpers', () => {
  it('retries only transient model API statuses', () => {
    expect(shouldRetryModelRequest(408)).toBe(true);
    expect(shouldRetryModelRequest(429)).toBe(true);
    expect(shouldRetryModelRequest(500)).toBe(true);
    expect(shouldRetryModelRequest(400)).toBe(false);
  });
});
