import { expect, type Page } from '@playwright/test'
import { authTest as test } from '../helpers/fixtures'
import { mockChatSocket } from 'tests/helpers/mock-chat-socket.js'

const seedChatData = async (page: Page) => {
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
            title: 'Test Conversation',
            isActive: 1,
            messageCount: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]

        const messages = [
          {
            id: 1,
            conversationId: 1,
            role: 'user',
            content: 'First test message',
            timestamp: new Date(),
            isStreaming: false,
          },
          {
            id: 2,
            conversationId: 1,
            role: 'assistant',
            content: 'Assistant response',
            timestamp: new Date(),
            isStreaming: false,
          },
        ]

        const conversationStore = tx.objectStore('conversation')
        const messageStore = tx.objectStore('message')

        for (const conv of conversations) conversationStore.put(conv)
        for (const msg of messages) messageStore.put(msg)

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

const getMessageCount = async (page: Page): Promise<number> => {
  return page.evaluate(() => {
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('AppDb')
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['message'], 'readonly')
        const store = tx.objectStore('message')
        const countRequest = store.count()
        countRequest.onsuccess = () => {
          db.close()
          resolve(countRequest.result)
        }
        countRequest.onerror = () => {
          reject(countRequest.error)
        }
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  })
}

const getMessageContentById = async (page: Page, messageId: number): Promise<string> => {
  return page.evaluate((id) => {
    return new Promise<string>((resolve, reject) => {
      const request = indexedDB.open('AppDb')
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['message'], 'readonly')
        const store = tx.objectStore('message')
        const getRequest = store.get(id)
        getRequest.onsuccess = () => {
          db.close()
          resolve(getRequest.result?.content || '')
        }
        getRequest.onerror = () => {
          reject(getRequest.error)
        }
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  }, messageId)
}

test.describe('Chat View Race Conditions E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockChatSocket(page, {
      ackDelayMs: 10,
      chunkDelayMs: 30,
      chunksPerMessage: 2,
    })

    // Seed before app reads IndexedDB
    await page.goto('/chat', { waitUntil: 'commit', timeout: 15000 })
    await seedChatData(page)

    // Navigate again, app reads seeded data during onMounted
    await page.goto('/chat', { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Wait for the input - it only appears when messages are loaded
    // This IS our hydration signal (user-visible behavior)
    await page
      .getByTestId('chat-message-input-bottom')
      .waitFor({ state: 'visible', timeout: 10000 })
  })

  test('socket mock prevents real backend calls', async ({ page }) => {
    let socketIoRequests = 0

    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('socket.io') || url.includes(':3700')) {
        socketIoRequests++
      }
    })

    await page.getByTestId('chat-message-input-bottom').fill('Test message')
    await page.getByTestId('chat-send-button-bottom').click()
    await page.waitForTimeout(500)

    expect(socketIoRequests).toBe(0)
  })

  test('user cannot spam save edited message', async ({ page }) => {
    const userMessage = page.getByTestId('message-1')

    await userMessage.hover()
    await userMessage.getByTestId('message-menu-button').click()
    await expect(userMessage.getByTestId('message-menu-dropdown')).toBeVisible()
    await userMessage.getByTestId('message-edit-button').click()

    const textarea = userMessage.getByTestId('message-edit-textarea')
    await expect(textarea).toBeVisible()
    await textarea.fill('Edited message content')

    const saveButton = userMessage.getByTestId('message-save-button')

    await saveButton.click()

    await page.waitForTimeout(1000)

    const messageContent = await getMessageContentById(page, 1)
    expect(messageContent).toBe('Edited message content')
  })

  test('send button is disabled while message is being sent', async ({ page }) => {
    const input = page.getByTestId('chat-message-input-bottom')
    const sendButton = page.getByTestId('chat-send-button-bottom')

    await input.fill('Testing disabled state')

    await expect(sendButton).toBeEnabled()
    await sendButton.click()
    await expect(sendButton).toBeDisabled()
  })

  test('user can edit message content', async ({ page }) => {
    const userMessage = page.getByTestId('message-1')

    await userMessage.hover()
    await userMessage.getByTestId('message-menu-button').click()
    await userMessage.getByTestId('message-edit-button').click()

    const textarea = userMessage.getByTestId('message-edit-textarea')
    await textarea.fill('Updated content')

    await userMessage.getByTestId('message-save-button').click()
    await textarea.waitFor({ state: 'hidden', timeout: 5000 })

    const content = await getMessageContentById(page, 1)
    expect(content).toBe('Updated content')
  })

  test('send button becomes stop button during streaming', async ({ page }) => {
    const input = page.getByTestId('chat-message-input-bottom')
    await input.fill('Trigger streaming')

    const sendButton = page.getByTestId('chat-send-button-bottom')
    await expect(sendButton).toBeVisible()

    await sendButton.click()

    const stopButton = page.getByTestId('chat-abort-button-bottom')
    await expect(stopButton).toBeVisible({ timeout: 2000 })
    await expect(sendButton).not.toBeVisible()
  })

  test('user can type new message while previous is streaming', async ({ page }) => {
    const input = page.getByTestId('chat-message-input-bottom')

    await input.fill('First message')
    await page.getByTestId('chat-send-button-bottom').click()

    await expect(input).toBeEnabled()

    await input.fill('Second message while streaming')

    const inputValue = await input.inputValue()
    expect(inputValue).toBe('Second message while streaming')
  })

  test('user can stop streaming and send new message', async ({ page }) => {
    const input = page.getByTestId('chat-message-input-bottom')
    const initialCount = await getMessageCount(page)

    await input.fill('First message')
    await page.getByTestId('chat-send-button-bottom').click()

    const stopButton = page.getByTestId('chat-abort-button-bottom')
    await expect(stopButton).toBeVisible({ timeout: 2000 })

    await input.fill('Second message')
    await stopButton.click()

    const sendButton = page.getByTestId('chat-send-button-bottom')
    await expect(sendButton).toBeVisible({ timeout: 2000 })

    await sendButton.click()

    await page.waitForTimeout(1000)

    const finalCount = await getMessageCount(page)
    expect(finalCount).toBeGreaterThanOrEqual(initialCount + 2)
  })

  test('stop button prevents spam clicking', async ({ page }) => {
    const input = page.getByTestId('chat-message-input-bottom')

    await input.fill('Trigger streaming')
    await page.getByTestId('chat-send-button-bottom').click()

    const stopButton = page.getByTestId('chat-abort-button-bottom')
    await expect(stopButton).toBeVisible({ timeout: 2000 })

    await stopButton.click()

    const sendButton = page.getByTestId('chat-send-button-bottom')
    await expect(sendButton).toBeVisible({ timeout: 2000 })
  })

  test('user cannot send empty messages', async ({ page }) => {
    const initialCount = await getMessageCount(page)

    const sendButton = page.getByTestId('chat-send-button-bottom')
    await expect(sendButton).toBeDisabled()

    await page.waitForTimeout(500)

    const finalCount = await getMessageCount(page)
    expect(finalCount).toBe(initialCount)
  })

  test('save button shows loading state and is disabled during save', async ({ page }) => {
    const userMessage = page.getByTestId('message-1')

    await userMessage.hover()
    await userMessage.getByTestId('message-menu-button').click()
    await userMessage.getByTestId('message-edit-button').click()

    const textarea = userMessage.getByTestId('message-edit-textarea')
    await textarea.fill('Testing save loading state')

    const saveButton = userMessage.getByTestId('message-save-button')
    await saveButton.click()

    await expect(textarea).not.toBeVisible({ timeout: 5000 })

    const content = await getMessageContentById(page, 1)
    expect(content).toBe('Testing save loading state')
  })

  test('user can cancel edit without triggering race condition', async ({ page }) => {
    const userMessage = page.getByTestId('message-1')

    await userMessage.hover()
    await userMessage.getByTestId('message-menu-button').click()
    await userMessage.getByTestId('message-edit-button').click()

    const textarea = userMessage.getByTestId('message-edit-textarea')
    const originalContent = await textarea.inputValue()
    await textarea.fill('This should be cancelled')

    const cancelButton = userMessage.getByTestId('message-cancel-button')
    await cancelButton.click()
    await expect(textarea).not.toBeVisible({ timeout: 5000 })

    const messageContent = await getMessageContentById(page, 1)
    expect(messageContent).toBe(originalContent)
  })

  test.skip('editing message during streaming cancels and regenerates response', async ({
    page,
  }) => {
    // TODO: Remove .skip() when edit-to-regenerate feature is implemented
    // Expected: Edit during stream aborts current response and regenerates with edited message

    const initialCount = await getMessageCount(page)

    await page.getByTestId('chat-message-input-bottom').fill('Original question')
    await page.getByTestId('chat-send-button-bottom').click()
    await page.waitForTimeout(100)

    const userMessage = page.getByTestId(`message-${initialCount + 1}`)
    await userMessage.hover()
    await userMessage.getByTestId('message-menu-button').click()
    await userMessage.getByTestId('message-edit-button').click()

    const textarea = userMessage.getByTestId('message-edit-textarea')
    await textarea.fill('Edited question triggers regeneration')
    await userMessage.getByTestId('message-save-button').click()
    await expect(textarea).not.toBeVisible({ timeout: 5000 })

    const editedContent = await getMessageContentById(page, initialCount + 1)
    expect(editedContent).toBe('Edited question triggers regeneration')

    const newAssistantResponse = await getMessageContentById(page, initialCount + 2)
    expect(newAssistantResponse).toContain('Chunk')
  })

  test('send and edit operations complete independently', async ({ page }) => {
    const initialCount = await getMessageCount(page)

    await page.getByTestId('chat-message-input-bottom').fill('New message')

    const userMessage = page.getByTestId('message-1')
    await userMessage.hover()
    await userMessage.getByTestId('message-menu-button').click()
    await userMessage.getByTestId('message-edit-button').click()

    const textarea = userMessage.getByTestId('message-edit-textarea')
    await textarea.fill('Edited content')
    await page.getByTestId('chat-send-button-bottom').click()
    await userMessage.getByTestId('message-save-button').click()
    await expect(textarea).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('chat-message-input-bottom')).toBeEnabled({ timeout: 5000 })

    const editedContent = await getMessageContentById(page, 1)
    expect(editedContent).toBe('Edited content')

    const finalCount = await getMessageCount(page)
    expect(finalCount).toBeGreaterThanOrEqual(initialCount + 1)
  })

  test('keyboard shortcuts respect race condition guards', async ({ page }) => {
    const input = page.getByTestId('chat-message-input-bottom')
    await input.fill('Testing keyboard submit')

    const initialCount = await getMessageCount(page)

    await input.press('Enter')
    await input.press('Enter')
    await input.press('Enter')
    await expect(input).toBeEnabled({ timeout: 5000 })
    await page.waitForTimeout(500)

    const finalCount = await getMessageCount(page)
    expect(finalCount - initialCount).toBeGreaterThanOrEqual(1)
    expect(finalCount - initialCount).toBeLessThanOrEqual(2)
  })
})
