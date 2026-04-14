import type { Page } from '@playwright/test'
import type { Message, Conversation } from '@/database/types'
import { IndexedDbManager } from './indexeddb-manager'
import type { Prompt } from '@/composables/use-prompts-socket'
import { safeGoto, safeReload } from './safe-navigation'

export type PlaywrightOptions = {
  referer?: string
  timeout?: number
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
}

const currentTimestamp = String(Date.now())

export const testData = {
  chatView: {
    conversations: [
      {
        id: 1,
        title: 'Test Conversation',
        isActive: 1,
        createdAt: new Date('2026-02-07T10:00:00Z'),
        updatedAt: new Date('2026-02-07T10:00:00Z'),
      },
    ] satisfies Conversation[],
    messages: [
      {
        id: 1,
        conversationId: 1,
        role: 'user' as const,
        content: 'First test message',
        timestamp: new Date('2026-02-07T10:00:00Z'),
        isStreaming: false,
      },
      {
        id: 2,
        conversationId: 1,
        role: 'assistant' as const,
        content: 'Assistant response',
        timestamp: new Date('2026-02-07T10:01:00Z'),
        isStreaming: false,
      },
    ] satisfies Message[],
  },

  historyView: {
    conversations: [
      {
        id: 1,
        title: 'Vue component patterns',
        isActive: 1,
        createdAt: new Date('2026-01-15T10:00:00Z'),
        updatedAt: new Date('2026-01-15T10:00:00Z'),
      },
      {
        id: 2,
        title: 'TypeScript debugging guide',
        isActive: 1,
        createdAt: new Date('2026-01-20T14:00:00Z'),
        updatedAt: new Date('2026-01-20T14:00:00Z'),
      },
      {
        id: 3,
        title: 'Python data science',
        isActive: 1,
        createdAt: new Date('2026-01-25T16:00:00Z'),
        updatedAt: new Date('2026-01-25T16:00:00Z'),
      },
    ] satisfies Conversation[],
    messages: [
      {
        id: 1,
        conversationId: 1,
        role: 'user' as const,
        content: 'How to structure Vue 3 components?',
        timestamp: new Date('2026-01-15T10:00:00Z'),
        isStreaming: false,
      },
      {
        id: 2,
        conversationId: 1,
        role: 'assistant' as const,
        content: 'Use composition API with script setup',
        timestamp: new Date('2026-01-15T10:01:00Z'),
        isStreaming: false,
      },
      {
        id: 3,
        conversationId: 2,
        role: 'user' as const,
        content: 'How to debug TypeScript errors effectively?',
        timestamp: new Date('2026-01-20T14:00:00Z'),
        isStreaming: false,
      },
      {
        id: 4,
        conversationId: 2,
        role: 'assistant' as const,
        content: 'Use neverthrow for explicit error handling',
        timestamp: new Date('2026-01-20T14:01:00Z'),
        isStreaming: false,
      },
      {
        id: 5,
        conversationId: 3,
        role: 'user' as const,
        content: 'Best libraries for data analysis?',
        timestamp: new Date('2026-01-25T16:00:00Z'),
        isStreaming: false,
      },
      {
        id: 6,
        conversationId: 3,
        role: 'assistant' as const,
        content: 'Pandas, NumPy, and Matplotlib are essential',
        timestamp: new Date('2026-01-25T16:01:00Z'),
        isStreaming: false,
      },
    ] satisfies Message[],
  },

  promptsView: {
    prompts: [
      {
        id: 1,
        userId: '123',
        name: 'E2E Test Prompt',
        command: 'e2etest',
        description: 'Prompt used for E2E testing',
        template: 'You are an E2E testing assistant.',
        isSystem: false,
        isActive: true,
        createdAt: currentTimestamp,
        updatedAt: currentTimestamp,
      },
      {
        id: 2,
        userId: '123',
        name: 'Code Reviewer',
        command: 'review',
        description: 'Reviews code for potential issues',
        template: 'Review the following code and highlight issues and improvements.',
        isSystem: true,
        isActive: true,
        createdAt: currentTimestamp,
        updatedAt: currentTimestamp,
      },
      {
        id: 3,
        userId: '123',
        name: 'Bug Hunter',
        command: 'bughunt',
        description: 'Helps find bugs in TypeScript code',
        template: 'Find potential bugs and edge cases in this TypeScript snippet.',
        isSystem: false,
        isActive: true,
        createdAt: currentTimestamp,
        updatedAt: currentTimestamp,
      },
    ] satisfies Prompt[],
  },
}

export const gotoOptions: PlaywrightOptions = {
  waitUntil: 'domcontentloaded',
  timeout: 5000,
}

export async function seedChatViewData(page: Page): Promise<void> {
  const db = new IndexedDbManager(page, gotoOptions)
  await db.prepare()

  await db.seedData({
    conversations: testData.chatView.conversations,
    messages: testData.chatView.messages,
  })
  safeReload(page)
  await page.waitForTimeout(2000)
}

export async function seedHistoryViewData(page: Page): Promise<void> {
  const db = new IndexedDbManager(page, gotoOptions)
  await db.prepare()

  await db.seedData({
    conversations: testData.historyView.conversations,
    messages: testData.historyView.messages,
  })
  safeReload(page)
  await page.waitForTimeout(2000)

  await safeGoto(page, '/history', gotoOptions)
}

export async function seedPromptsViewData(page: Page): Promise<void> {
  const db = new IndexedDbManager(page, gotoOptions)
  await db.prepare()

  await db.seedData({ prompts: testData.promptsView.prompts })
  safeReload(page)
  await page.waitForTimeout(2000)

  await safeGoto(page, '/prompts', gotoOptions)
}
