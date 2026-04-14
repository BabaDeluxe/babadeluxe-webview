import type { Page } from '@playwright/test'
import type { Message, Conversation } from '@/database/types'
import type { Prompt } from '@/composables/use-prompts-socket'
import { logger } from '@/logger'
import type { PlaywrightOptions } from './test-data'
import { safeGoto } from './safe-navigation'

const dbName = 'AppDb'
const storeNames = {
  conversation: 'conversation',
  message: 'message',
  settings: 'settings',
  prompts: 'prompts',
} as const

type StoreName = (typeof storeNames)[keyof typeof storeNames]

export class IndexedDbManager {
  constructor(
    private readonly _page: Page,
    private readonly _gotoOptions: PlaywrightOptions
  ) {}

  async prepare(): Promise<void> {
    await safeGoto(this._page, '/chat', this._gotoOptions)
  }

  async deleteDatabase(): Promise<void> {
    await this._page.evaluate((dbName) => {
      return new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName)
        deleteRequest.onsuccess = () => {
          resolve()
        }
        deleteRequest.onerror = () => {
          reject(deleteRequest.error)
        }
        deleteRequest.onblocked = () => {
          reject(new Error(`Database ${dbName} deletion blocked`))
        }
      })
    }, dbName)
  }

  async createStores(storeNames: StoreName[]): Promise<void> {
    await this._page.evaluate(
      ({ dbName, stores }) => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onupgradeneeded = () => {
            const db = request.result
            for (const storeName of stores) {
              if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, {
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

          request.onerror = () => {
            reject(request.error)
          }
        })
      },
      { dbName, stores: storeNames }
    )
  }

  async seedStore<T extends Record<string, unknown>>(
    storeName: StoreName,
    data: T[]
  ): Promise<void> {
    await this._page.evaluate(
      ({ dbName, store, items }) => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction([store], 'readwrite')
            const objectStore = tx.objectStore(store)

            for (const item of items) {
              objectStore.put(item)
            }

            tx.oncomplete = () => {
              db.close()
              resolve()
            }

            tx.onerror = () => {
              db.close()
              reject(tx.error)
            }
          }

          request.onerror = () => {
            reject(request.error)
          }
        })
      },
      { dbName, store: storeName, items: data }
    )
  }

  async seedConversations(conversations: Conversation[]): Promise<void> {
    await this.seedStore(storeNames.conversation, conversations)
  }

  async seedMessages(messages: Message[]): Promise<void> {
    await this.seedStore(storeNames.message, messages)
  }
  async seedPrompts(prompts: Prompt[]): Promise<void> {
    await this.seedStore(storeNames.prompts, prompts)
  }

  async seedData(opts: {
    conversations?: Conversation[]
    messages?: Message[]
    prompts?: Prompt[]
  }): Promise<void> {
    const { conversations, messages, prompts } = opts
    if (!conversations && !messages && !prompts) {
      logger.warn('No seed data provided')
      return
    }

    await this.deleteDatabase()

    const stores: StoreName[] = []

    if (conversations) stores.push(storeNames.conversation)
    if (messages) stores.push(storeNames.message)
    if (prompts) stores.push(storeNames.prompts)

    await this.createStores(stores)

    if (conversations) await this.seedConversations(conversations)
    if (messages) await this.seedMessages(messages)
    if (prompts) await this.seedPrompts(prompts)
  }

  async getMessageCount(): Promise<number> {
    return this._page.evaluate(
      ({ dbName, store }) => {
        return new Promise<number>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction([store], 'readonly')
            const countRequest = tx.objectStore(store).count()

            countRequest.onsuccess = () => {
              db.close()
              resolve(countRequest.result)
            }

            countRequest.onerror = () => {
              db.close()
              reject(countRequest.error)
            }
          }

          request.onerror = () => {
            reject(request.error)
          }
        })
      },
      { dbName, store: storeNames.message }
    )
  }

  async getConversationCount(): Promise<number> {
    return this._page.evaluate(
      ({ dbName, store }) => {
        return new Promise<number>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction([store], 'readonly')
            const countRequest = tx.objectStore(store).count()

            countRequest.onsuccess = () => {
              db.close()
              resolve(countRequest.result)
            }

            countRequest.onerror = () => {
              db.close()
              reject(countRequest.error)
            }
          }

          request.onerror = () => {
            reject(request.error)
          }
        })
      },
      { dbName, store: storeNames.conversation }
    )
  }

  async getMessageById(messageId: number): Promise<Message | undefined> {
    return this._page.evaluate(
      ({ dbName, store, id }) => {
        return new Promise<Message | undefined>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction([store], 'readonly')
            const getRequest = tx.objectStore(store).get(id)

            getRequest.onsuccess = () => {
              db.close()
              resolve(getRequest.result)
            }

            getRequest.onerror = () => {
              db.close()
              reject(getRequest.error)
            }
          }

          request.onerror = () => {
            reject(request.error)
          }
        })
      },
      { dbName, store: storeNames.message, id: messageId }
    )
  }

  async getAllMessages(): Promise<Message[]> {
    return this._page.evaluate(
      ({ dbName, store }) => {
        return new Promise<Message[]>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction([store], 'readonly')
            const getAllRequest = tx.objectStore(store).getAll()

            getAllRequest.onsuccess = () => {
              db.close()
              resolve(getAllRequest.result as Message[])
            }

            getAllRequest.onerror = () => {
              db.close()
              reject(getAllRequest.error)
            }
          }

          request.onerror = () => {
            reject(request.error)
          }
        })
      },
      { dbName, store: storeNames.message }
    )
  }

  async getAllConversations(): Promise<Conversation[]> {
    return this._page.evaluate(
      ({ dbName, store }) => {
        return new Promise<Conversation[]>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction([store], 'readonly')
            const getAllRequest = tx.objectStore(store).getAll()

            getAllRequest.onsuccess = () => {
              db.close()
              resolve(getAllRequest.result as Conversation[])
            }

            getAllRequest.onerror = () => {
              db.close()
              reject(getAllRequest.error)
            }
          }

          request.onerror = () => {
            reject(request.error)
          }
        })
      },
      { dbName, store: storeNames.conversation }
    )
  }
}
