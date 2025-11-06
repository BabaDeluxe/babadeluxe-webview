import { expect, type Page } from '@playwright/test'
import { test } from '../helpers/fixtures'

const seedTestData = async (page: Page) => {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase('AppDb')
      deleteRequest.onsuccess = () => resolve()
      deleteRequest.onerror = () => reject(deleteRequest.error)
      deleteRequest.onblocked = () => reject(new Error('Database deletion blocked'))
    })
  })

  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AppDb')

      request.onerror = () => reject(request.error)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('conversation')) {
          db.createObjectStore('conversation', { keyPath: 'id', autoIncrement: true })
        }
        if (!db.objectStoreNames.contains('message')) {
          db.createObjectStore('message', { keyPath: 'id', autoIncrement: true })
        }
      }

      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['conversation', 'message'], 'readwrite')

        const conversations = [
          {
            id: 1,
            title: 'TypeScript debugging guide',
            isActive: 0,
            messageCount: 2,
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
          },
          {
            id: 2,
            title: 'Vue component patterns',
            isActive: 1,
            messageCount: 1,
            createdAt: new Date('2025-01-02'),
            updatedAt: new Date('2025-01-02'),
          },
          {
            id: 3,
            title: 'Python data science',
            isActive: 0,
            messageCount: 1,
            createdAt: new Date('2025-01-03'),
            updatedAt: new Date('2025-01-03'),
          },
        ]

        const messages = [
          {
            id: 1,
            conversationId: 1,
            role: 'user',
            content: 'How to debug TypeScript errors effectively?',
            timestamp: new Date('2025-01-01'),
            isStreaming: false,
          },
          {
            id: 2,
            conversationId: 1,
            role: 'assistant',
            content: 'Use neverthrow for better error handling in TypeScript',
            timestamp: new Date('2025-01-01'),
            isStreaming: false,
          },
          {
            id: 3,
            conversationId: 2,
            role: 'user',
            content: 'Vue composition API examples',
            timestamp: new Date('2025-01-02'),
            isStreaming: false,
          },
          {
            id: 4,
            conversationId: 3,
            role: 'user',
            content: 'Pandas dataframe operations',
            timestamp: new Date('2025-01-03'),
            isStreaming: false,
          },
        ]

        const conversationStore = tx.objectStore('conversation')
        const messageStore = tx.objectStore('message')

        for (const conv of conversations) {
          conversationStore.put(conv)
        }

        for (const msg of messages) {
          messageStore.put(msg)
        }

        tx.oncomplete = () => {
          db.close()
          resolve()
        }

        tx.onerror = () => reject(tx.error)
      }
    })
  })
}

test.describe('History Search E2E', () => {
  test.beforeEach(async ({ page, testUser }) => {
    const { email, password } = testUser

    await page.goto('/', { waitUntil: 'networkidle' })

    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('AppDb')
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('Database deletion blocked'))
      })
    })

    await page.getByLabel('Email Address').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.click('button:has-text("Sign In")')

    await page.waitForURL('**/chat')

    await seedTestData(page)
    await page.reload()

    await page.getByText('History').click()
    await page.waitForURL('**/history')
  })

  test('user can search and find their conversation by title', async ({ page }) => {
    await page.getByPlaceholder('Search for a message').fill('typescript')

    const searchDropdown = page.getByLabel('Search results dropdown')
    await expect(
      searchDropdown
        .locator('[data-result-type="conversation"]')
        .getByText('TypeScript debugging guide')
    ).toBeVisible()
  })
  test('user can search and find message content', async ({ page }) => {
    await page.getByPlaceholder('Search for a message').fill('neverthrow')

    const searchDropdown = page.getByLabel('Search results dropdown')
    await expect(searchDropdown.getByText(/neverthrow/i)).toBeVisible()
    await expect(
      searchDropdown
        .locator('[data-result-type="message"]')
        .first()
        .getByText(/message in/i)
    ).toBeVisible()
  })

  test('user sees helpful message when no results match their search', async ({ page }) => {
    await page.getByPlaceholder('Search for a message').fill('nonexistentquery123')

    await expect(page.getByText(/no matches found/i)).toBeVisible()
  })

  test('user can open a conversation from search results', async ({ page }) => {
    await page.getByPlaceholder('Search for a message').fill('typescript')

    const searchDropdown = page.getByLabel('Search results dropdown')
    await searchDropdown.locator('[data-result-type="conversation"]').click()

    // Wait for conversation heading to confirm navigation
    const messagesHeading = page.getByRole('heading', {
      name: /messages in "typescript debugging guide"/i,
    })
    await expect(messagesHeading).toBeVisible()

    // Scope to message panel region (sibling of heading)
    const messagePanel = messagesHeading.locator('..')
    await expect(messagePanel.getByText(/how to debug typescript errors/i)).toBeVisible()
    await expect(messagePanel.getByText(/use neverthrow/i)).toBeVisible()
  })

  test('user can quickly dismiss search with escape key', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search for a message')

    await searchInput.fill('typescript')

    const searchDropdown = page.getByLabel('Search results dropdown')
    await expect(searchDropdown).toBeVisible()

    await searchInput.press('Escape')

    await expect(searchInput).toHaveValue('')
    await expect(searchDropdown).not.toBeVisible()
  })

  test('user can filter their conversation list by typing', async ({ page }) => {
    await page.getByPlaceholder('Search for a message').fill('Vue')

    const conversationsList = page.getByRole('heading', { name: /^conversations$/i }).locator('..')

    await expect(conversationsList.getByText('Vue component patterns')).toBeVisible()
    await expect(conversationsList.getByText('Python data science')).not.toBeVisible()
    await expect(conversationsList.getByText('TypeScript debugging guide')).not.toBeVisible()
  })
})
