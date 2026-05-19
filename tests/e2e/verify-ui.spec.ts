import { test, expect } from '@playwright/test';

test('verify settings and prompts views load', async ({ page }) => {
  // Mock login if needed, or skip if offline mode works
  await page.goto('/settings');
  await expect(page.getByTestId('settings-view')).toBeVisible();
  await page.screenshot({ path: 'settings-view.png' });

  await page.goto('/prompts');
  await expect(page.getByTestId('prompts-view')).toBeVisible();
  await page.screenshot({ path: 'prompts-view.png' });
});
