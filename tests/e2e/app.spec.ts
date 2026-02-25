import { expect } from '@playwright/test'
import { authTest as test } from './helpers/fixtures'
import { createLocatorDealer, locators } from './helpers/locators'

test.describe('App navigation', () => {
  test('header history link navigates to /history', async ({ page, browserName }) => {
    await page.goto('/chat', {
      waitUntil: browserName === 'webkit' ? 'commit' : 'domcontentloaded',
      timeout: 20000,
    })

    const dealer = createLocatorDealer(page, {
      [locators.historyTab]: { isVisible: true, isEnabled: true },
      [locators.historyRoot]: { isVisible: true, timeoutMs: 15000 },
    })

    const historyTab = await dealer.get(locators.historyTab)
    await historyTab.click()

    await page.waitForURL('**/history', { timeout: 15000 })
    await dealer.get(locators.historyRoot)

    await expect(page.getByTestId('history-view-container')).toBeVisible()
  })
})
