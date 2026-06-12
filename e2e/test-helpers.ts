import type { Page } from '@playwright/test';

export async function setTurns(page: Page, turns: number): Promise<void> {
  await page.locator('#turns-input').evaluate((element, nextTurns) => {
    const input = element as HTMLInputElement;
    input.value = String(nextTurns);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, turns);
}

export async function setParticipantSelection(
  page: Page,
  selectedParticipantIds: string[],
): Promise<void> {
  await page.locator('#checkbox-grid').evaluate((grid, selectedIds) => {
    const selected = new Set(selectedIds as string[]);
    for (const input of grid.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      input.checked = selected.has(input.value);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, selectedParticipantIds);
}
