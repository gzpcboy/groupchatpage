export const MODEL_API_RETRY_DELAYS_MS = [500, 1000, 2000];

export function shouldRetryModelRequest(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function waitForRetry(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}
