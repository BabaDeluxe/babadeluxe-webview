import { expect } from '@playwright/test'
import { authTest as test } from './helpers/fixtures'
import { createLocatorDealer, locators } from './helpers/locators'
import { safeGoto } from './helpers/safe-navigation'
import { gotoOptions } from './helpers/test-data'

test.describe.configure({ mode: 'serial' })

test.describe('Prompts View', () => {
  test.beforeEach(async ({ page }) => {
    await safeGoto(page, '/prompts', gotoOptions)
  })

  test('creates a new prompt successfully', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.promptsNewButton]: { isVisible: true, isEnabled: true },
      [locators.promptsSaveButton]: { isVisible: true },
    })

    const newButton = await dealer.get(locators.promptsNewButton)
    await newButton.click()

    await (await dealer.get(locators.promptsNameInput)).fill('E2E Test Prompt')
    await (await dealer.get(locators.promptsCommandInput)).fill('e2etest')
    await (await dealer.get(locators.promptsDescriptionInput)).fill('E2E description')
    await (await dealer.get(locators.promptsTemplateInput)).fill('Test template content')

    const saveButton = await dealer.get(locators.promptsSaveButton)
    await expect(saveButton).toBeEnabled()
    await saveButton.click()

    // Assert result: prompt appears in the list
    await expect(page.getByText('E2E Test Prompt')).toBeVisible({ timeout: 5000 })
  })

  test('edits an existing prompt', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.promptsItemFirst]: { isVisible: true },
      [locators.promptsNameInput]: { isVisible: true },
      [locators.promptsSaveButton]: { isVisible: true },
    })

    const item = await dealer.get(locators.promptsItemFirst)
    const hasPrompts = await item.isVisible().catch(() => false)
    if (!hasPrompts) {
      test.skip()
      return
    }

    await item.click()

    const nameInput = await dealer.get(locators.promptsNameInput)
    const originalName = await nameInput.inputValue()

    await nameInput.fill(`${originalName} - Updated`)

    const saveButton = await dealer.get(locators.promptsSaveButton)
    await expect(saveButton).toBeEnabled()
    await saveButton.click()

    await expect(page.getByText(`${originalName} - Updated`)).toBeVisible({ timeout: 5000 })
  })

  test('deletes a prompt after confirmation', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.promptsItemFirst]: { isVisible: true },
      [locators.promptsDeleteButton]: { isVisible: true, isEnabled: true },
      [locators.promptsDeleteDialog]: { isVisible: true },
    })

    const item = await dealer.get(locators.promptsItemFirst)
    const hasPrompts = await item.isVisible().catch(() => false)
    if (!hasPrompts) {
      test.skip()
      return
    }

    const promptText = (await item.textContent()) ?? ''

    const deleteButton = await dealer.get(locators.promptsDeleteButton)
    await deleteButton.click()

    const modal = await dealer.get(locators.promptsDeleteDialog)
    await expect(modal).toContainText(promptText)

    await modal.getByRole('button', { name: /delete/i }).click()

    await expect(modal).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText(promptText)).not.toBeVisible()
  })

  test('shows validation errors on empty save', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.promptsNewButton]: { isVisible: true, isEnabled: true },
      [locators.promptsSaveButton]: { isVisible: true, isDisabled: true },
    })

    const newButton = await dealer.get(locators.promptsNewButton)
    await newButton.click()

    const saveButton = await dealer.get(locators.promptsSaveButton)
    await expect(saveButton).toBeDisabled()
  })

  test('enables save button when form is valid', async ({ page }) => {
    const dealer = createLocatorDealer(page, {
      [locators.promptsNewButton]: { isVisible: true, isEnabled: true },
      [locators.promptsSaveButton]: { isVisible: true },
    })

    const newButton = await dealer.get(locators.promptsNewButton)
    await newButton.click()

    const saveButton = await dealer.get(locators.promptsSaveButton)
    await expect(saveButton).toBeDisabled()

    await (await dealer.get(locators.promptsNameInput)).fill('Test')
    await (await dealer.get(locators.promptsCommandInput)).fill('test')
    await (await dealer.get(locators.promptsTemplateInput)).fill('Test template')

    await expect(saveButton).toBeEnabled()
  })

  test('shows vertical split on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    const verticalResizer = page.locator('.cursor-row-resize')
    await expect(verticalResizer).toBeVisible()
  })

  test('shows horizontal split on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })

    const horizontalResizer = page.locator('.cursor-col-resize')
    await expect(horizontalResizer).toBeVisible()
  })
})
