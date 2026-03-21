import { expect } from '@playwright/test'
import { authTest as test } from './helpers/fixtures'
import { seedHistoryViewData } from './helpers/test-data'
import { createLocatorDealer, locators } from './helpers/locators'

test.describe('History View E2E', () => {
  test.beforeEach(async ({ page }) => {
    await seedHistoryViewData(page)
    await page.waitForTimeout(2000)

    const dealer = createLocatorDealer(page, {
      [locators.historyRoot]: { isVisible: true },
      [locators.historySearchInput]: { isVisible: true },
      [locators.historyConversationsHeading]: { isVisible: true },
    })

    await dealer.get(locators.historyRoot)
    await dealer.get(locators.historySearchInput)

    const list = await dealer.get(locators.historyConversationsContainer)
    await expect(list.getByText('Vue component patterns')).toBeVisible({ timeout: 10_000 })
  })

  test('user can search and find their conversation by title', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.historySearchInput]: { isVisible: true, isEnabled: true },
      [locators.historySearchDropdown]: { isVisible: true },
    })

    const searchInput = await dealer.get(locators.historySearchInput)
    await searchInput.fill('typescript')

    const dropdown = await dealer.get(locators.historySearchDropdown)
    await expect(
      dropdown.locator('[data-result-type="conversation"]').getByText('TypeScript debugging guide')
    ).toBeVisible()
  })

  test('user can search and find message content', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.historySearchInput]: { isVisible: true, isEnabled: true },
      [locators.historySearchDropdown]: { isVisible: true },
    })

    const searchInput = await dealer.get(locators.historySearchInput)
    await searchInput.fill('neverthrow')

    const dropdown = await dealer.get(locators.historySearchDropdown)
    await expect(dropdown.getByText(/neverthrow/i)).toBeVisible()
    await expect(
      dropdown
        .locator('[data-result-type="message"]')
        .first()
        .getByText(/message in/i)
    ).toBeVisible()
  })

  test('user sees helpful message when no results match their search', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.historySearchInput]: { isVisible: true, isEnabled: true },
    })

    const searchInput = await dealer.get(locators.historySearchInput)
    await searchInput.fill('nonexistentquery123')

    await expect(page.getByText(/no matches found/i)).toBeVisible()
  })

  test('user can open a conversation from search results', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.historySearchInput]: { isVisible: true, isEnabled: true },
      [locators.historySearchDropdown]: { isVisible: true },
    })

    const searchInput = await dealer.get(locators.historySearchInput)
    await searchInput.fill('typescript')

    const dropdown = await dealer.get(locators.historySearchDropdown)
    const result = dropdown.locator('[data-result-type="conversation"]')

    await expect(result).toBeVisible()
    await result.click()

    const messagesHeading = page.getByRole('heading', {
      name: /messages in "typescript debugging guide"/i,
    })
    await expect(messagesHeading).toBeVisible()

    const panel = messagesHeading.locator('..')
    await expect(panel.getByText(/how to debug typescript errors/i)).toBeVisible()
    await expect(panel.getByText(/use neverthrow/i)).toBeVisible()
  })

  test('user can quickly dismiss search with escape key', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.historySearchInput]: { isVisible: true, isEnabled: true },
      [locators.historySearchDropdown]: { isVisible: true },
    })

    const searchInput = await dealer.get(locators.historySearchInput)
    await searchInput.fill('typescript')

    const dropdown = await dealer.get(locators.historySearchDropdown)
    await expect(dropdown).toBeVisible()

    await searchInput.press('Escape')

    await expect(searchInput).toHaveValue('')
    await expect(dropdown).not.toBeVisible()
  })

  test('user can filter their conversation list by typing', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.historySearchInput]: { isVisible: true, isEnabled: true },
      [locators.historyConversationsContainer]: { isVisible: true },
    })

    const searchInput = await dealer.get(locators.historySearchInput)
    await searchInput.fill('Vue')

    const list = await dealer.get(locators.historyConversationsContainer)

    await expect(list.getByText('Vue component patterns')).toBeVisible()
    await expect(list.getByText('Python data science')).not.toBeVisible()
    await expect(list.getByText('TypeScript debugging guide')).not.toBeVisible()
  })
})
