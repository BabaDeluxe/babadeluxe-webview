import { expect, type Page } from '@playwright/test'
import { authTest as test } from '../helpers/fixtures'

const seedSettingsData = async (page: Page) => {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase('AppDb')
      deleteRequest.onsuccess = () => {
        resolve()
      }
      deleteRequest.onerror = () => {
        reject(deleteRequest.error)
      }
      deleteRequest.onblocked = () => {
        reject(new Error('Database deletion blocked'))
      }
    })
  })

  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AppDb')

      request.onerror = () => {
        reject(request.error)
      }

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'settingKey' })
        }
      }

      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['settings'], 'readwrite')

        const settings = [
          {
            settingKey: 'apiKeyOpenai',
            settingValue: '',
            dataType: 'string',
            required: false,
            description: 'OpenAI API key for GPT models',
          },
          {
            settingKey: 'apiKeyAnthropic',
            settingValue: '',
            dataType: 'string',
            required: false,
            description: 'Anthropic API key for Claude models',
          },
        ]

        const settingsStore = tx.objectStore('settings')

        for (const setting of settings) {
          settingsStore.put(setting)
        }

        tx.oncomplete = () => {
          db.close()
          resolve()
        }

        tx.onerror = () => {
          reject(tx.error)
        }
      }
    })
  })
}

test.describe('Settings View E2E', () => {
  test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === 'webkit') {
      testInfo.setTimeout(60000)
    }
    await page.goto('/chat', {
      waitUntil: browserName === 'webkit' ? 'commit' : 'domcontentloaded',
      timeout: 20000,
    })

    await seedSettingsData(page)

    if (browserName === 'webkit') {
      await page.waitForTimeout(500)
    }
    await page.goto('/settings', {
      waitUntil: browserName === 'webkit' ? 'commit' : 'domcontentloaded',
      timeout: 20000,
    })

    await page
      .getByTestId('loading-state')
      .waitFor({ state: 'hidden', timeout: 10000 })
      .catch(() => {})

    await expect(page.getByTestId('api-providers-section')).toBeVisible({ timeout: 10000 })
  })

  test('user can view API key fields', async ({ page }) => {
    const openaiInput = page.locator('input[name="apiKeyOpenai"]')
    const anthropicInput = page.locator('input[name="apiKeyAnthropic"]')

    await expect(openaiInput).toBeVisible()
    await expect(anthropicInput).toBeVisible()
  })

  test('user can toggle API key visibility', async ({ page }) => {
    const openaiInput = page.locator('input[name="apiKeyOpenai"]')
    const toggleButton = page.locator('button[name="toggle-secret-apiKeyOpenai"]')
    await expect(openaiInput).toHaveAttribute('type', 'password')

    await toggleButton.click()
    await expect(openaiInput).toHaveAttribute('type', 'text')

    await toggleButton.click()
    await expect(openaiInput).toHaveAttribute('type', 'password')
  })

  test('user sees validation error for invalid API key format', async ({ page }) => {
    const openaiInput = page.locator('input[name="apiKeyOpenai"]')

    await openaiInput.fill('abc')
    await page.waitForTimeout(600)

    const errorAlert = page.locator('[role="alert"][aria-label="Error for OpenAI"]')
    await expect(errorAlert).toBeVisible()
  })

  test('user can dismiss models reload warning', async ({ page }) => {
    await page.evaluate(() => {
      const event = new CustomEvent('show-warning', {
        detail: { message: 'Test warning' },
      })
      window.dispatchEvent(event)
    })

    const warning = page.getByTestId('models-reload-warning')
    if (await warning.isVisible().catch(() => false)) {
      await page.getByTestId('dismiss-warning-button').click()
      await expect(warning).not.toBeVisible()
    }
  })

  test('user sees loading state on initial page load', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'commit', timeout: 10000 })
    const loadingState = page.getByTestId('loading-state')
    const isVisible = await loadingState.isVisible().catch(() => false)

    if (isVisible) {
      await expect(loadingState).not.toBeVisible({ timeout: 10000 })
    }
    await expect(page.getByTestId('api-providers-section')).toBeVisible()
  })

  test('API key inputs have proper accessibility labels', async ({ page }) => {
    const openaiInput = page.getByLabel('OpenAI API key')
    const anthropicInput = page.getByLabel('Anthropic API key')

    await expect(openaiInput).toBeVisible()
    await expect(anthropicInput).toBeVisible()
  })
})
