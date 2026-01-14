import type { Page } from '@playwright/test'
import type { Message, Conversation } from '@/database/types'

// Constants
const dbName = 'AppDb'
const stores = {
  conversation: 'conversation',
  message: 'message',
  settings: 'settings',
} as const

type TestModels = {
  openai: string[]
  anthropic: string[]
  gemini: string[]
}

type TestSettings = Array<{
  settingKey: string
  settingValue: string
  dataType: string
  required: boolean
  description: string
}>

// Window mocking (init scripts)
export async function seedModelsInWindow(page: Page, models?: TestModels): Promise<void> {
  const defaultModels: TestModels = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
    anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    gemini: ['gemini-2.0-flash-exp', 'gemini-exp-1206'],
  }

  await page.addInitScript((testModels) => {
    // @ts-ignore
    window.__TEST_MODELS__ = testModels
  }, models ?? defaultModels)
}

// IndexedDB helpers
async function deleteAndRecreateDb(page: Page, storeNames: string[]): Promise<void> {
  await page.evaluate(
    ({ db, storeNames }) => {
      return new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(db)
        deleteRequest.onsuccess = () => {
          resolve()
        }
        deleteRequest.onerror = () => {
          reject(deleteRequest.error)
        }
        deleteRequest.onblocked = () => {
          reject(new Error(`Database ${db} deletion blocked`))
        }
      }).then(() => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(db)

          request.onerror = () => {
            reject(request.error)
          }

          request.onupgradeneeded = () => {
            const database = request.result
            for (const storeName of storeNames) {
              if (!database.objectStoreNames.contains(storeName)) {
                database.createObjectStore(storeName, {
                  keyPath: storeName === 'settings' ? 'settingKey' : 'id',
                  autoIncrement: storeName !== 'settings',
                })
              }
            }
          }

          request.onsuccess = () => {
            request.result.close()
            resolve()
          }
        })
      })
    },
    { db: dbName, storeNames }
  )
}

async function seedDbStore<T extends Record<string, unknown>>(
  page: Page,
  storeName: string,
  data: T[]
): Promise<void> {
  await page.evaluate(
    ({ db, store, items }) => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(db)

        request.onerror = () => {
          reject(request.error)
        }

        request.onsuccess = () => {
          const database = request.result
          const tx = database.transaction([store], 'readwrite')
          const objectStore = tx.objectStore(store)

          for (const item of items) {
            objectStore.put(item)
          }

          tx.oncomplete = () => {
            database.close()
            resolve()
          }

          tx.onerror = () => {
            database.close()
            reject(tx.error)
          }
        }
      })
    },
    { db: dbName, store: storeName, items: data }
  )
}

// High-level seeding functions
export async function seedConversationsInDb(
  page: Page,
  conversations?: Conversation[],
  messages?: Message[]
): Promise<void> {
  const defaultConversations: Conversation[] = [
    {
      id: 1,
      title: 'Test Conversation',
      isActive: 1,
      messageCount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const defaultMessages: Message[] = [
    {
      id: 1,
      conversationId: 1,
      role: 'user',
      content: 'Test user message',
      timestamp: new Date(),
      isStreaming: false,
    },
    {
      id: 2,
      conversationId: 1,
      role: 'assistant',
      content: 'Test assistant response',
      timestamp: new Date(),
      isStreaming: false,
    },
  ]

  await deleteAndRecreateDb(page, [stores.conversation, stores.message])
  await seedDbStore(page, stores.conversation, conversations ?? defaultConversations)
  await seedDbStore(page, stores.message, messages ?? defaultMessages)
}

export async function seedSettingsInDb(page: Page, settings?: TestSettings): Promise<void> {
  const defaultSettings: TestSettings = [
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

  await deleteAndRecreateDb(page, [stores.settings])
  await seedDbStore(page, stores.settings, settings ?? defaultSettings)
}

export async function seedTestData(page: Page): Promise<void> {
  const conversations: Conversation[] = [
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

  const messages: Message[] = [
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

  await seedConversationsInDb(page, conversations, messages)
}

// Query functions
export async function getMessageCount(page: Page): Promise<number> {
  return page.evaluate(
    ({ db, store }) => {
      return new Promise<number>((resolve, reject) => {
        const request = indexedDB.open(db)

        request.onsuccess = () => {
          const database = request.result
          const tx = database.transaction([store], 'readonly')
          const countRequest = tx.objectStore(store).count()

          countRequest.onsuccess = () => {
            database.close()
            resolve(countRequest.result)
          }

          countRequest.onerror = () => {
            database.close()
            reject(countRequest.error)
          }
        }

        request.onerror = () => {
          reject(request.error)
        }
      })
    },
    { db: dbName, store: stores.message }
  )
}

export async function getMessageContentById(page: Page, messageId: number): Promise<string> {
  return page.evaluate(
    ({ db, store, id }) => {
      return new Promise<string>((resolve, reject) => {
        const request = indexedDB.open(db)

        request.onsuccess = () => {
          const database = request.result
          const tx = database.transaction([store], 'readonly')
          const getRequest = tx.objectStore(store).get(id)

          getRequest.onsuccess = () => {
            database.close()
            resolve(getRequest.result?.content ?? '')
          }

          getRequest.onerror = () => {
            database.close()
            reject(getRequest.error)
          }
        }

        request.onerror = () => {
          reject(request.error)
        }
      })
    },
    { db: dbName, store: stores.message, id: messageId }
  )
}

export async function getAllMessages(page: Page): Promise<Message[]> {
  return page.evaluate(
    ({ db, store }) => {
      return new Promise<Message[]>((resolve, reject) => {
        const request = indexedDB.open(db)

        request.onsuccess = () => {
          const database = request.result
          const tx = database.transaction([store], 'readonly')
          const getAllRequest = tx.objectStore(store).getAll()

          getAllRequest.onsuccess = () => {
            database.close()
            resolve(getAllRequest.result as Message[])
          }

          getAllRequest.onerror = () => {
            database.close()
            reject(getAllRequest.error)
          }
        }

        request.onerror = () => {
          reject(request.error)
        }
      })
    },
    { db: dbName, store: stores.message }
  )
}
