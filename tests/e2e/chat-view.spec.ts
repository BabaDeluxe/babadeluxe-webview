import { expect } from '@playwright/test'
import { authTest as test } from './helpers/fixtures'
import { seedChatViewData } from './helpers/test-data'
import { createLocatorDealer, locators } from './helpers/locators'
import { logger } from '@/logger'
import { tryClick } from 'tests/e2e/helpers/try-click'

test.describe('Chat View E2E', () => {
  test.beforeEach(async ({ page, db }) => {
    await seedChatViewData(page)

    const dealer = createLocatorDealer(page, {
      [locators.chatView]: { isVisible: true },
    })
    await dealer.get(locators.chatView)

    const messageCount = await db.getMessageCount()
    logger.log('📊 Messages in DB before navigation:', messageCount)
    expect(messageCount).toBe(2)
  })

  test.describe('socket & basic send', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/chat')
    })

    test('enters streaming state and stores user message', async ({ page, db }) => {
      const dealer = createLocatorDealer(page, {
        [locators.chatInput]: { isVisible: true, isEnabled: true },
        [locators.chatSend]: { isVisible: true, isEnabled: true },
        [locators.chatAbort]: { isVisible: true },
      })

      const input = await dealer.get(locators.chatInput)
      await input.fill('Test message')

      const send = await dealer.get(locators.chatSend)
      await expect(send).toBeEnabled()

      await tryClick(page, send)

      // UI: streaming state (abort button visible)
      const abort = await dealer.get(locators.chatAbort)
      await expect(abort).toBeVisible({ timeout: 5000 })

      // Data: user message persisted in IndexedDB
      const messages = await db.getAllMessages()
      expect(messages.at(-1)?.content).toBe('Test message')
    })

    test('blocks empty messages', async ({ page, db }) => {
      const initialCount = await db.getMessageCount()

      const dealer = createLocatorDealer(page, {
        [locators.chatSend]: { isVisible: true, isDisabled: true },
      })

      const send = await dealer.get(locators.chatSend)

      // Disabled button should effectively be a no-op
      await tryClick(page, send)

      const finalCount = await db.getMessageCount()
      expect(finalCount).toBe(initialCount)
    })

    test('cannot send a second message while streaming', async ({ page, db }) => {
      const dealer = createLocatorDealer(page, {
        [locators.chatInput]: { isVisible: true, isEnabled: true },
        [locators.chatSend]: { isVisible: true, isEnabled: true },
        [locators.chatAbort]: { isVisible: true },
      })

      const input = await dealer.get(locators.chatInput)
      await input.fill('First message')
      const send = await dealer.get(locators.chatSend)
      await tryClick(page, send)

      const abort = await dealer.get(locators.chatAbort)
      await expect(abort).toBeVisible({ timeout: 5000 })

      await input.fill('Second message attempt')

      // While streaming, send button should not be available
      await expect(send).not.toBeVisible()

      const messages = await db.getAllMessages()
      const userMessages = messages.filter((m) => m.role === 'user')
      // 2 = 1 seeded + 1 newly sent
      expect(userMessages.length).toBe(2)
    })

    test('empty-state input and message-list input both work', async ({ page, db }) => {
      // Start from empty-state input (top)
      const dealerTop = createLocatorDealer(page, {
        [locators.chatInput]: { isVisible: true, isEnabled: true },
        [locators.chatSend]: { isVisible: true, isEnabled: true },
      })

      const topInput = await dealerTop.get(locators.chatInput)
      await topInput.fill('From empty state')
      const topSend = await dealerTop.get(locators.chatSend)
      await tryClick(page, topSend)

      // After first send, we should be in message list view with bottom input
      const dealerBottom = createLocatorDealer(page, {
        [locators.chatInput]: { isVisible: true, isEnabled: true },
        [locators.chatSend]: { isVisible: true, isEnabled: true },
      })

      const bottomInput = await dealerBottom.get(locators.chatInput)
      await bottomInput.fill('From message list')
      const bottomSend = await dealerBottom.get(locators.chatSend)
      await tryClick(page, bottomSend)

      const messages = await db.getAllMessages()
      const contents = messages.map((m) => m.content)
      expect(contents).toContain('From empty state')
      expect(contents).toContain('From message list')
    })
  })

  test.describe('edit user message', () => {
    test('user can edit message content', async ({ page, db }) => {
      const dealer = createLocatorDealer(page, {
        [locators.message1]: { isVisible: true },
        [locators.messageMenu]: { isVisible: true, isEnabled: true },
        [locators.menuEdit]: { isVisible: true, isEnabled: true },
        [locators.messageTextarea]: { isVisible: true },
        [locators.messageSave]: { isVisible: true, isEnabled: true },
      })

      const msg = await dealer.get(locators.message1)
      await msg.hover()

      const menu = await dealer.get(locators.messageMenu)
      await tryClick(page, menu)

      const edit = await dealer.get(locators.menuEdit)
      await tryClick(page, edit)

      const textarea = await dealer.get(locators.messageTextarea)
      await textarea.fill('Updated content')

      const save = await dealer.get(locators.messageSave)
      await tryClick(page, save)

      await expect(textarea).not.toBeVisible({ timeout: 5000 })

      const message = await db.getMessageById(1)
      expect(message?.content).toBe('Updated content')
    })

    test('user can cancel edit without changing stored content', async ({ page, db }) => {
      const dealer = createLocatorDealer(page, {
        [locators.message1]: { isVisible: true },
        [locators.messageMenu]: { isVisible: true, isEnabled: true },
        [locators.menuEdit]: { isVisible: true, isEnabled: true },
        [locators.messageTextarea]: { isVisible: true },
        [locators.messageCancel]: { isVisible: true, isEnabled: true },
      })

      const original = await db.getMessageById(1)

      const msg = await dealer.get(locators.message1)
      await msg.hover()

      const menu = await dealer.get(locators.messageMenu)
      await tryClick(page, menu)

      const edit = await dealer.get(locators.menuEdit)
      await tryClick(page, edit)

      const textarea = await dealer.get(locators.messageTextarea)
      await textarea.fill('This should be cancelled')

      const cancel = await dealer.get(locators.messageCancel)
      await tryClick(page, cancel)

      await expect(textarea).not.toBeVisible({ timeout: 5000 })

      const message = await db.getMessageById(1)
      expect(message?.content).toBe(original?.content)
    })

    test('editing a message does not break main input', async ({ page, db }) => {
      const dealer = createLocatorDealer(page, {
        [locators.message1]: { isVisible: true },
        [locators.messageMenu]: { isVisible: true, isEnabled: true },
        [locators.menuEdit]: { isVisible: true, isEnabled: true },
        [locators.messageTextarea]: { isVisible: true },
        [locators.messageCancel]: { isVisible: true, isEnabled: true },
        [locators.chatInput]: { isVisible: true, isEnabled: true },
      })

      const msg = await dealer.get(locators.message1)
      await msg.hover()

      const menu = await dealer.get(locators.messageMenu)
      await tryClick(page, menu)

      const edit = await dealer.get(locators.menuEdit)
      await tryClick(page, edit)

      const textarea = await dealer.get(locators.messageTextarea)
      const input = await dealer.get(locators.chatInput)

      await expect(input).toBeEnabled()
      await input.fill('Message while editing')

      const messagesBefore = await db.getAllMessages()

      const cancel = await dealer.get(locators.messageCancel)
      await tryClick(page, cancel)

      await expect(textarea).not.toBeVisible({ timeout: 5000 })

      const messagesAfter = await db.getAllMessages()
      expect(messagesAfter.length).toBe(messagesBefore.length)
    })
  })
})
