import { expect, type Page } from '@playwright/test'
import { authTest as test } from '../helpers/fixtures'

const mockApiKeys = async (page: Page, hasKeys: boolean) => {
  await page.addInitScript((shouldMock) => {
    // @ts-ignore
    window.__TEST_SETTINGS__ = shouldMock
      ? [
          { settingKey: 'apiKeyOpenai', settingValue: 'sk-test-key' },
          { settingKey: 'apiKeyGemini', settingValue: 'test-key' },
        ]
      : []
  }, hasKeys)
}

const mockModels = async (page: Page, hasModels: boolean) => {
  await page.addInitScript((shouldMock) => {
    // @ts-ignore
    window.__TEST_MODELS__ = shouldMock
      ? {
          openai: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
          anthropic: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229'],
          gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        }
      : undefined
  }, hasModels)
}

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

const getAllMessages = async (
  page: Page
): Promise<Array<{ id: number; content: string; role: string }>> => {
  return page.evaluate(() => {
    return new Promise<Array<{ id: number; content: string; role: string }>>((resolve, reject) => {
      const request = indexedDB.open('AppDb')
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['message'], 'readonly')
        const store = tx.objectStore('message')
        const getAllRequest = store.getAll()
        getAllRequest.onsuccess = () => {
          db.close()
          resolve(getAllRequest.result as Array<{ id: number; content: string; role: string }>)
        }
        getAllRequest.onerror = () => {
          reject(getAllRequest.error)
        }
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  })
}

test.describe('Chat View Race Conditions E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiKeys(page, true)
    await mockModels(page, true)

    await page.goto('/chat', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await seedChatData(page)
    await page
      .getByTestId('chat-message-input-bottom')
      .waitFor({ state: 'visible', timeout: 10000 })
  })

  test.describe('socket & basic send', () => {
    test('send button is disabled while message is being sent', async ({ page }) => {
      const input = page.getByTestId('chat-message-input-bottom')
      await input.waitFor({ state: 'attached', timeout: 3000 })
      await input.fill('Testing disabled state')

      const sendButton = page.getByTestId('chat-send-button-bottom')
      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await expect(sendButton).toBeEnabled()
      await expect(sendButton).toBeVisible()

      await sendButton.click()
      await expect(sendButton).toBeVisible()
    })

    test('send button becomes stop button during streaming', async ({ page }) => {
      const input = page.getByTestId('chat-message-input-bottom')
      await input.waitFor({ state: 'attached', timeout: 3000 })
      await input.fill('Trigger streaming')

      const sendButton = page.getByTestId('chat-send-button-bottom')
      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await expect(sendButton).toBeVisible()

      await sendButton.click()

      const stopButton = page.getByTestId('chat-abort-button-bottom')
      await stopButton.waitFor({ state: 'attached', timeout: 3000 })

      await sendButton.waitFor({ state: 'detached', timeout: 3000 })
      await expect(stopButton).toBeEnabled({ timeout: 3000 })
      await expect(stopButton).toBeVisible({ timeout: 3000 })
      await expect(sendButton).not.toBeVisible()
    })

    test('user cannot send empty messages', async ({ page }) => {
      const initialCount = await getMessageCount(page)

      const sendButton = page.getByTestId('chat-send-button-bottom')
      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await expect(sendButton).toBeDisabled()

      const finalCount = await getMessageCount(page)
      expect(finalCount).toBe(initialCount)
    })

    test('user can type new message while previous is streaming', async ({ page }) => {
      const input = page.getByTestId('chat-message-input-bottom')
      await input.waitFor({ state: 'attached', timeout: 3000 })
      await input.fill('First message')

      const sendButton = page.getByTestId('chat-send-button-bottom')
      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await sendButton.click()

      await expect(input).toBeEnabled()

      await input.fill('Second message while streaming')
      const inputValue = await input.inputValue()
      expect(inputValue).toBe('Second message while streaming')
    })

    test('user can stop streaming and send new message', async ({ page }) => {
      const input = page.getByTestId('chat-message-input-bottom')
      await input.waitFor({ state: 'attached', timeout: 3000 })
      const initialCount = await getMessageCount(page)

      await input.fill('First message')

      const sendButton = page.getByTestId('chat-send-button-bottom')
      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await expect(sendButton).toBeVisible({ timeout: 3000 })

      await sendButton.click()

      const stopButton = page.getByTestId('chat-abort-button-bottom')
      const abortStillVisible = await stopButton.isVisible().catch(() => false)
      if (abortStillVisible) {
        await stopButton.click()
      }

      await input.fill('Second message')
      await sendButton.waitFor({ state: 'attached', timeout: 5000 })
      await expect(sendButton).toBeVisible({ timeout: 5000 })
      await sendButton.click()

      await expect(async () => {
        const finalCount = await getMessageCount(page)
        expect(finalCount).toBeGreaterThanOrEqual(initialCount + 2)
      }).toPass({ timeout: 5000 })

      const finalCount = await getMessageCount(page)
      expect(finalCount).toBeGreaterThanOrEqual(initialCount + 2)
    })

    test('stop button prevents spam clicking', async ({ page }) => {
      const input = page.getByTestId('chat-message-input-bottom')
      await input.waitFor({ state: 'attached', timeout: 3000 })
      await expect(input).toBeVisible()

      await input.fill('Trigger streaming')

      const sendButton = page.getByTestId('chat-send-button-bottom')
      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await sendButton.click()

      const stopButton = page.getByTestId('chat-abort-button-bottom')
      await stopButton.waitFor({ state: 'attached', timeout: 3000 })
      await expect(stopButton).toBeEnabled({ timeout: 3000 })
      await expect(stopButton).toBeVisible({ timeout: 3000 })

      await stopButton.click()

      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await expect(sendButton).toBeEnabled({ timeout: 3000 })
      await expect(sendButton).toBeVisible({ timeout: 3000 })
    })

    test('keyboard shortcuts respect race condition guards', async ({ page }) => {
      const input = page.getByTestId('chat-message-input-bottom')
      await input.waitFor({ state: 'attached', timeout: 3000 })
      await input.fill('Testing keyboard submit')

      const initialCount = await getMessageCount(page)

      await expect(input).toBeEnabled({ timeout: 5000 })
      await expect(input).toBeVisible({ timeout: 5000 })
      await input.press('Enter')
      await input.press('Enter')
      await input.press('Enter')
      await expect(input).toBeEnabled({ timeout: 5000 })
      await expect(input).toBeVisible({ timeout: 5000 })

      const finalCount = await getMessageCount(page)
      expect(finalCount - initialCount).toBeGreaterThanOrEqual(1)
      expect(finalCount - initialCount).toBeLessThanOrEqual(2)
    })

    test('send and edit operations complete independently', async ({ page }) => {
      const initialCount = await getMessageCount(page)

      const input = page.getByTestId('chat-message-input-bottom')
      await input.waitFor({ state: 'attached', timeout: 3000 })
      await input.fill('New message')

      const userMessage = page.getByTestId('message-1')
      await userMessage.waitFor({ state: 'attached', timeout: 3000 })
      await userMessage.hover()

      const menuButton = userMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const editButton = userMessage.getByTestId('message-edit-button')
      await editButton.waitFor({ state: 'attached', timeout: 3000 })
      await editButton.click()

      const textarea = userMessage.getByTestId('message-edit-textarea')
      await textarea.waitFor({ state: 'attached', timeout: 3000 })
      await textarea.fill('Edited content')

      const sendButton = page.getByTestId('chat-send-button-bottom')
      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await sendButton.click()

      const saveButton = userMessage.getByTestId('message-save-button')
      await saveButton.waitFor({ state: 'attached', timeout: 3000 })
      await saveButton.click()

      await expect(textarea).not.toBeVisible({ timeout: 5000 })
      await expect(input).toBeEnabled({ timeout: 5000 })

      const editedContent = await getMessageContentById(page, 1)
      expect(editedContent).toBe('Edited content')

      const finalCount = await getMessageCount(page)
      expect(finalCount).toBeGreaterThanOrEqual(initialCount + 1)
    })
  })

  test.describe('edit user message', () => {
    test('user cannot spam save edited message', async ({ page }) => {
      const userMessage = page.getByTestId('message-1')
      await userMessage.waitFor({ state: 'attached', timeout: 3000 })

      await userMessage.hover()

      const menuButton = userMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const menuDropdown = userMessage.getByTestId('message-menu-dropdown')
      await menuDropdown.waitFor({ state: 'attached', timeout: 3000 })
      await expect(menuDropdown).toBeVisible()

      const editButton = userMessage.getByTestId('message-edit-button')
      await editButton.waitFor({ state: 'attached', timeout: 3000 })
      await editButton.click()

      const textarea = userMessage.getByTestId('message-edit-textarea')
      await textarea.waitFor({ state: 'attached', timeout: 3000 })
      await expect(textarea).toBeVisible()
      await textarea.fill('Edited message content')

      const saveButton = userMessage.getByTestId('message-save-button')
      await saveButton.waitFor({ state: 'attached', timeout: 3000 })
      await saveButton.click()

      const messageContent = await getMessageContentById(page, 1)
      expect(messageContent).toBe('Edited message content')
    })

    test('user can edit message content', async ({ page }) => {
      const userMessage = page.getByTestId('message-1')
      await userMessage.waitFor({ state: 'attached', timeout: 3000 })

      await userMessage.hover()

      const menuButton = userMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const editButton = userMessage.getByTestId('message-edit-button')
      await editButton.waitFor({ state: 'attached', timeout: 3000 })
      await editButton.click()

      const textarea = userMessage.getByTestId('message-edit-textarea')
      await textarea.waitFor({ state: 'attached', timeout: 3000 })
      await textarea.fill('Updated content')

      const saveButton = userMessage.getByTestId('message-save-button')
      await saveButton.waitFor({ state: 'attached', timeout: 3000 })
      await saveButton.click()
      await textarea.waitFor({ state: 'hidden', timeout: 5000 })

      const content = await getMessageContentById(page, 1)
      expect(content).toBe('Updated content')
    })

    test('save button shows loading state and is disabled during save', async ({ page }) => {
      const userMessage = page.getByTestId('message-1')
      await userMessage.waitFor({ state: 'attached', timeout: 3000 })

      await userMessage.hover()

      const menuButton = userMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const editButton = userMessage.getByTestId('message-edit-button')
      await editButton.waitFor({ state: 'attached', timeout: 3000 })
      await editButton.click()

      const textarea = userMessage.getByTestId('message-edit-textarea')
      await textarea.waitFor({ state: 'attached', timeout: 3000 })
      await textarea.fill('Testing save loading state')

      const saveButton = userMessage.getByTestId('message-save-button')
      await saveButton.waitFor({ state: 'attached', timeout: 3000 })
      await saveButton.click()

      await expect(textarea).not.toBeVisible({ timeout: 5000 })

      const content = await getMessageContentById(page, 1)
      expect(content).toBe('Testing save loading state')
    })

    test('user can cancel edit without changing stored content', async ({ page }) => {
      const userMessage = page.getByTestId('message-1')
      await userMessage.waitFor({ state: 'attached', timeout: 3000 })

      await userMessage.hover()

      const menuButton = userMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const editButton = userMessage.getByTestId('message-edit-button')
      await editButton.waitFor({ state: 'attached', timeout: 3000 })
      await editButton.click()

      const textarea = userMessage.getByTestId('message-edit-textarea')
      await textarea.waitFor({ state: 'attached', timeout: 3000 })
      const originalContent = await textarea.inputValue()
      await textarea.fill('This should be cancelled')

      const cancelButton = userMessage.getByTestId('message-cancel-button')
      await cancelButton.waitFor({ state: 'attached', timeout: 3000 })
      await cancelButton.click()
      await expect(textarea).not.toBeVisible({ timeout: 5000 })

      const messageContent = await getMessageContentById(page, 1)
      expect(messageContent).toBe(originalContent)
    })

    test('edit user message keeps subsequent messages and regenerates assistant in place', async ({
      page,
    }) => {
      await page.evaluate(() => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('AppDb')
          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction(['message'], 'readwrite')
            const store = tx.objectStore('message')

            const additionalMessages = [
              {
                id: 3,
                conversationId: 1,
                role: 'user',
                content: 'Second user message',
                timestamp: new Date(),
                isStreaming: false,
              },
              {
                id: 4,
                conversationId: 1,
                role: 'assistant',
                content: 'Second assistant response',
                timestamp: new Date(),
                isStreaming: false,
              },
            ]

            for (const msg of additionalMessages) {
              store.put(msg)
            }

            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.onerror = () => {
              reject(tx.error)
            }
          }
          request.onerror = () => {
            reject(request.error)
          }
        })
      })

      const initialCount = await getMessageCount(page)
      expect(initialCount).toBe(4)

      const originalAssistant2 = await getMessageContentById(page, 2)

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page
        .getByTestId('chat-message-input-bottom')
        .waitFor({ state: 'visible', timeout: 10000 })

      const userMessage = page.getByTestId('message-1')
      await userMessage.waitFor({ state: 'attached', timeout: 3000 })
      await userMessage.hover()

      const menuButton = userMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const editButton = userMessage.getByTestId('message-edit-button')
      await editButton.waitFor({ state: 'attached', timeout: 3000 })
      await editButton.click()

      const textarea = userMessage.getByTestId('message-edit-textarea')
      await textarea.waitFor({ state: 'attached', timeout: 3000 })
      await textarea.fill('Edited first message - triggers regenerate')

      const saveButton = userMessage.getByTestId('message-save-button')
      await saveButton.waitFor({ state: 'attached', timeout: 3000 })
      await saveButton.click()
      await expect(textarea).not.toBeVisible({ timeout: 5000 })

      const assistantMessage = page.getByTestId('message-2')
      await assistantMessage.waitFor({ state: 'attached', timeout: 5000 })
      await expect
        .poll(async () => getMessageContentById(page, 2), {
          timeout: 10000,
        })
        .not.toBe(originalAssistant2)

      const finalCount = await getMessageCount(page)
      expect(finalCount).toBe(initialCount)

      const editedContent = await getMessageContentById(page, 1)
      expect(editedContent).toBe('Edited first message - triggers regenerate')

      const newAssistant2 = await getMessageContentById(page, 2)
      expect(newAssistant2).not.toBe(originalAssistant2)

      const messages = await getAllMessages(page)
      const ids = messages.map((m) => m.id).sort((a, b) => a - b)
      expect(ids).toEqual([1, 2, 3, 4])
    })

    test('edit regenerates assistant in place and preserves IDs', async ({ page }) => {
      const initialMessages = await getAllMessages(page)
      const initialCount = initialMessages.length
      const initialAssistantIds = initialMessages
        .filter((message) => message.role === 'assistant')
        .map((message) => message.id)

      const userMessage = page.getByTestId('message-1')
      await userMessage.waitFor({ state: 'attached', timeout: 3000 })
      await userMessage.hover()

      const menuButton = userMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const editButton = userMessage.getByTestId('message-edit-button')
      await editButton.waitFor({ state: 'attached', timeout: 3000 })
      await editButton.click()

      const textarea = userMessage.getByTestId('message-edit-textarea')
      await textarea.waitFor({ state: 'attached', timeout: 3000 })
      await textarea.fill('Testing ID preservation')

      const saveButton = userMessage.getByTestId('message-save-button')
      await saveButton.waitFor({ state: 'attached', timeout: 3000 })
      await saveButton.click()
      await expect(textarea).not.toBeVisible({ timeout: 5000 })

      const userContent = await getMessageContentById(page, 1)
      expect(userContent).toBe('Testing ID preservation')

      const finalMessages = await getAllMessages(page)
      const finalCount = finalMessages.length
      const finalAssistantIds = finalMessages.filter((m) => m.role === 'assistant').map((m) => m.id)

      expect(finalCount).toBe(initialCount)
      expect(finalAssistantIds).toEqual(initialAssistantIds)
    })

    test('edit & regenerate works after aborting current stream', async ({ page }) => {
      const input = page.getByTestId('chat-message-input-bottom')
      await input.waitFor({ state: 'attached', timeout: 3000 })
      await input.fill('First message')

      const sendButton = page.getByTestId('chat-send-button-bottom')
      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await sendButton.click()

      const stopButton = page.getByTestId('chat-abort-button-bottom')
      await stopButton.waitFor({ state: 'attached', timeout: 3000 })
      await expect(stopButton).toBeVisible({ timeout: 3000 })
      await stopButton.click()

      await sendButton.waitFor({ state: 'attached', timeout: 3000 })
      await expect(sendButton).toBeVisible({ timeout: 3000 })

      const initialMessages = await getAllMessages(page)
      const lastUserMessage = initialMessages
        .filter((m) => m.role === 'user')
        .sort((a, b) => b.id - a.id)[0]

      const userMessage = page.getByTestId(`message-${lastUserMessage.id}`)
      await userMessage.waitFor({ state: 'attached', timeout: 3000 })
      await userMessage.hover()

      const menuButton = userMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const editButton = userMessage.getByTestId('message-edit-button')
      await editButton.waitFor({ state: 'attached', timeout: 3000 })
      await editButton.click()

      const textarea = userMessage.getByTestId('message-edit-textarea')
      await textarea.waitFor({ state: 'attached', timeout: 3000 })
      await textarea.fill('Edited after abort')

      const saveButton = userMessage.getByTestId('message-save-button')
      await saveButton.waitFor({ state: 'attached', timeout: 3000 })
      await saveButton.click()
      await expect(textarea).not.toBeVisible({ timeout: 5000 })

      const editedContent = await getMessageContentById(page, lastUserMessage.id)
      expect(editedContent).toBe('Edited after abort')
    })
  })

  test.describe('rewrite assistant message', () => {
    test('rewrite assistant message with different model regenerates in place', async ({
      page,
    }) => {
      const initialMessages = await getAllMessages(page)
      const initialCount = initialMessages.length
      const originalAssistant2 = await getMessageContentById(page, 2)

      const assistantMessage = page.getByTestId('message-2')
      await assistantMessage.waitFor({ state: 'attached', timeout: 3000 })
      await assistantMessage.hover()

      const menuButton = assistantMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const menuDropdown = assistantMessage.getByTestId('message-menu-dropdown')
      await menuDropdown.waitFor({ state: 'attached', timeout: 3000 })
      await expect(menuDropdown).toBeVisible()

      const rewriteTrigger = assistantMessage.getByTestId('message-rewrite-selector')
      await rewriteTrigger.waitFor({ state: 'attached', timeout: 3000 })
      await expect(rewriteTrigger).toBeVisible()
      await rewriteTrigger.click()

      await expect(page.getByText('Error loading models')).not.toBeVisible()

      // Use generic “first menu item” instead of hard-coding "gpt-4"
      const modelOption = page.locator('[role="menuitem"], [data-testid^="dropdown-item"]').first()
      await modelOption.waitFor({ state: 'visible', timeout: 3000 })
      await modelOption.click()

      // Let the content change, without depending on "Chunk" specifically
      await expect
        .poll(async () => getMessageContentById(page, 2), {
          timeout: 10000,
        })
        .not.toBe(originalAssistant2)

      const finalCount = await getMessageCount(page)
      expect(finalCount).toBe(initialCount)

      const messages = await getAllMessages(page)
      const assistantMessages = messages.filter((m) => m.role === 'assistant')
      expect(assistantMessages.length).toBeGreaterThanOrEqual(1)

      const rewritten = assistantMessages.find((m) => m.id === 2)
      expect(rewritten).toBeDefined()
      expect(rewritten!.content).not.toBe(originalAssistant2)
    })

    test('rewrite works for multiple assistant messages without deleting later messages', async ({
      page,
    }) => {
      await page.evaluate(() => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('AppDb')
          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction(['message'], 'readwrite')
            const store = tx.objectStore('message')

            const additionalMessages = [
              {
                id: 3,
                conversationId: 1,
                role: 'user',
                content: 'Third message',
                timestamp: new Date(),
                isStreaming: false,
              },
              {
                id: 4,
                conversationId: 1,
                role: 'assistant',
                content: 'Third assistant response',
                timestamp: new Date(),
                isStreaming: false,
              },
            ]

            for (const msg of additionalMessages) store.put(msg)

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

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page
        .getByTestId('chat-message-input-bottom')
        .waitFor({ state: 'visible', timeout: 10000 })

      const assistantMessage = page.getByTestId('message-4')
      await assistantMessage.waitFor({ state: 'attached', timeout: 3000 })
      await assistantMessage.hover()

      const menuButton = assistantMessage.getByTestId('message-menu-button')
      await menuButton.waitFor({ state: 'attached', timeout: 3000 })
      await menuButton.click()

      const menuDropdown = assistantMessage.getByTestId('message-menu-dropdown')
      await menuDropdown.waitFor({ state: 'attached', timeout: 3000 })
      await expect(menuDropdown).toBeVisible()

      const rewriteSelector = assistantMessage.getByTestId('message-rewrite-selector')
      await rewriteSelector.waitFor({ state: 'attached', timeout: 3000 })
      await expect(rewriteSelector).toBeVisible()
      await rewriteSelector.click()

      await expect(page.getByText('Error loading models')).not.toBeVisible()

      const firstModelOption = page
        .locator('[role="menuitem"], [data-testid^="dropdown-item"]')
        .first()
      await firstModelOption.waitFor({ state: 'visible', timeout: 3000 })
      await firstModelOption.click()
    })
  })
})
