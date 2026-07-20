import { expect, test } from '@playwright/test';

/**
 * Phase 8 full journey (docs/03): ingest → meeting → confirm speaker → consolidate → digest →
 * draft confirm. Executes in CI against a seeded stack with mocked externals (Groq/DeepSeek/Meta/
 * Google returning fixtures). This scaffold pins the entry points; CI seeds the data + auth.
 *
 * Runs only in CI (needs browsers + the running stack); excluded from the default `pnpm test` gate.
 */
test.describe('operator journey', () => {
  test('sign-in gate renders', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('main')).toBeVisible();
  });

  // The authenticated journey (seeded session) is enabled in CI once the stack + Clerk test token
  // are provisioned. Steps, in order:
  //  1. upload audio → pipeline reaches `persisted` (Pipeline view: run done, cost > 0)
  //  2. open the meeting → Topic Scrubber + transcript render; `[`/`]` jump topics
  //  3. confirm a suggested speaker → chip flips to confirmed
  //  4. Actions shows the extracted task; mark it done
  //  5. Upcoming shows a digest booking draft → Confirm → toast "Added to Google Calendar."
  //  6. Digests shows tonight's digest with all five sections → Re-send
  test.fixme(true, 'authenticated journey — enabled in CI with seeded session');
});
