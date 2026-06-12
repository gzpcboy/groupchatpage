/**
 * Ad-hoc Playwright E2E: sign in via device flow, then run GPT-4o vs Claude Sonnet chat.
 * Usage: node scripts/adhoc-e2e.mjs
 */
import { chromium } from 'playwright';

const LIVE_URL = process.env.PLAYWRIGHT_LIVE_URL ?? 'https://example.invalid/';
const CHAT_TIMEOUT = 300_000; // 5 min for full chat

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

console.log(`\n→ Navigating to ${LIVE_URL}`);
await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

const title = await page.title();
console.log(`  Page title: ${title}`);

// ── Step 1: trigger sign-in ─────────────────────────────────────────────────
console.log('\n→ Clicking "Sign in with GitHub"…');
await page.locator('#signin-btn').click();

// Wait for device modal
await page.locator('#device-modal').waitFor({ state: 'visible', timeout: 15_000 });
const code = await page.locator('#device-code').innerText();
const url  = await page.locator('#device-url').getAttribute('href');

console.log('\n╔══════════════════════════════════════════╗');
console.log(`║  DEVICE CODE : ${code.padEnd(26)}║`);
console.log(`║  URL         : ${(url ?? '').substring(0, 26).padEnd(26)}║`);
console.log('╚══════════════════════════════════════════╝');
console.log('\n  1. Open:', url);
console.log('  2. Enter code:', code);
console.log('\n  Waiting up to 5 minutes for you to approve…\n');

// ── Step 2: wait for modal to disappear (approval detected by app) ──────────
await page.locator('#device-modal').waitFor({ state: 'hidden', timeout: 300_000 });
console.log('✓ Sign-in approved — modal closed.');

// Confirm user info visible
await page.locator('#user-info').waitFor({ state: 'visible', timeout: 10_000 });
const userName = await page.locator('#user-name').innerText();
console.log(`✓ Signed in as: ${userName}`);

// ── Step 3: configure chat — GPT-4o + Claude Sonnet, 1 turn ─────────────────
console.log('\n→ Configuring chat: GPT-4o vs Claude Sonnet, 1 turn…');

// Deselect all checkboxes first, then select only gpt4o and claude
await page.locator('#checkbox-grid').evaluate(() => {
  for (const cb of document.querySelectorAll('#checkbox-grid input[type="checkbox"]')) {
    const input = cb;
    if (input.checked) {
      input.checked = false;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
});

// Select gpt4o
await page.locator('#checkbox-grid').evaluate(() => {
  for (const cb of document.querySelectorAll('#checkbox-grid input[type="checkbox"]')) {
    const input = cb;
    if (input.value === 'gpt4o' || input.value === 'claude') {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
});

// Set turns to 1
await page.locator('#turns-input').evaluate((el) => {
  el.value = '1';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

// Set topic
await page.locator('#topic-input').fill('In one sentence, what is 2+2 and why does it matter?');

// ── Step 4: start the chat ───────────────────────────────────────────────────
console.log('→ Starting chat…');
await page.locator('#start-btn').click();

// Wait for at least one message bubble
console.log('  Waiting for first message…');
await page.locator('#chat-messages .msg-wrap').first().waitFor({ state: 'visible', timeout: CHAT_TIMEOUT });
console.log('✓ First message appeared.');

// Wait for summary
console.log('  Waiting for summary…');
await page.locator('#summary-content').waitFor({ state: 'visible', timeout: CHAT_TIMEOUT });
// Wait until summary is not just the spinner
await page.waitForFunction(
  () => {
    const el = document.querySelector('#summary-content');
    return el && !el.querySelector('.thinking') && el.textContent.trim().length > 10;
  },
  { timeout: CHAT_TIMEOUT }
);
const summaryText = await page.locator('#summary-content').innerText();
console.log(`✓ Summary received (${summaryText.length} chars):\n  "${summaryText.substring(0, 120)}…"`);

// Wait for judge
console.log('  Waiting for judge verdict…');
await page.locator('#judge-content').waitFor({ state: 'visible', timeout: CHAT_TIMEOUT });
await page.waitForFunction(
  () => {
    const el = document.querySelector('#judge-content');
    return el && !el.querySelector('.thinking') && el.textContent.trim().length > 10;
  },
  { timeout: CHAT_TIMEOUT }
);
const judgeText = await page.locator('#judge-content').innerText();
console.log(`✓ Judge verdict received (${judgeText.length} chars):\n  "${judgeText.substring(0, 120)}…"`);

// Count messages
const msgCount = await page.locator('#chat-messages .msg-wrap').count();
console.log(`\n✓ Total message bubbles: ${msgCount}`);

console.log('\n🎉 E2E test PASSED — GPT-4o vs Claude Sonnet chat completed end-to-end.\n');

await browser.close();
process.exit(0);
