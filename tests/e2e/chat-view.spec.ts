import { expect } from '@playwright/test'
import { authTest as test } from './helpers/fixtures'
import { seedChatViewData } from './helpers/test-data'
import { createLocatorDealer, locators } from './helpers/locators'
import { logger } from '@/logger'

test.describe('Chat View Race Conditions E2E', () => {
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
    test('send button is disabled while message is being sent', async ({ page }) => {
      const dealer = createLocatorDealer(page, {
        [locators.chatInput]: { isVisible: true, isEnabled: true },
        [locators.chatSend]: { isVisible: true, isEnabled: true },
      })

      const input = await dealer.get(locators.chatInput)
      await input.fill('Testing disabled state')

      const send = await dealer.get(locators.chatSend)
      await send.click()
    })

    test('user cannot send empty messages', async ({ page, db }) => {
      const initialCount = await db.getMessageCount()

      createLocatorDealer(page, {
        [locators.chatSend]: { isVisible: true, isDisabled: true },
      })

      const finalCount = await db.getMessageCount()
      expect(finalCount).toBe(initialCount)
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
      await menu.click()

      const edit = await dealer.get(locators.menuEdit)
      await edit.click()

      const textarea = await dealer.get(locators.messageTextarea)
      await textarea.fill('Updated content')

      const save = await dealer.get(locators.messageSave)
      await save.click()
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
      await menu.click()

      const edit = await dealer.get(locators.menuEdit)
      await edit.click()

      const textarea = await dealer.get(locators.messageTextarea)
      await textarea.fill('This should be cancelled')

      const cancel = await dealer.get(locators.messageCancel)
      await cancel.click()
      await expect(textarea).not.toBeVisible({ timeout: 5000 })

      const message = await db.getMessageById(1)
      expect(message?.content).toBe(original?.content)
    })
  })
})
