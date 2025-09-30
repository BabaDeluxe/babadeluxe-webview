import type { Conversation, Message } from '@babadeluxe/shared'
import type { KeyValueStore } from './key-value-store'

type BaseSearchResult = {
  score: number
  highlights: string[]
}

export type ConversationSearchResult = BaseSearchResult & Conversation & { type: 'conversation' }
export type MessageSearchResult = BaseSearchResult & Message & { type: 'message' }
export type SearchResult = ConversationSearchResult | MessageSearchResult

export class DocumentStore {
  private get _conversationPrefix() {
    return 'search:conv:'
  }

  private get _messagePrefix() {
    return 'search:msg:'
  }

  private get _indexKey() {
    return 'search:index'
  }

  constructor(private readonly _kv: KeyValueStore) {}

  async clear(): Promise<void> {
    await this._kv.clear()
  }

  async storeConversations(conversations: Conversation[]): Promise<void> {
    const promises = conversations.map(async (conv) =>
      this._kv.set(`${this._conversationPrefix}${conv.id}`, JSON.stringify(conv))
    )
    await Promise.all(promises)

    const convIds = conversations.map((c) => c.id)
    await this._updateIndex('conversations', convIds)
  }

  async storeMessages(messages: Message[]): Promise<void> {
    const promises = messages.map(async (message) =>
      this._kv.set(`${this._messagePrefix}${message.id}`, JSON.stringify(message))
    )
    await Promise.all(promises)

    const messageIds = messages.map((m) => m.id)
    await this._updateIndex('messages', messageIds)
  }

  async getAllConversations(): Promise<Conversation[]> {
    const index = await this._getIndex()
    const convIds = index.conversations || []

    const promises = convIds.map(async (id) => {
      const json = await this._kv.get(`${this._conversationPrefix}${id}`)
      return json ? (JSON.parse(json) as Conversation) : null
    })

    const results = await Promise.all(promises)
    return results.filter(Boolean) as Conversation[]
  }

  async getAllMessages(): Promise<Message[]> {
    const index = await this._getIndex()
    const messageIds = index.messages || []

    const promises = messageIds.map(async (id) => {
      const json = await this._kv.get(`${this._messagePrefix}${id}`)
      return json ? (JSON.parse(json) as Message) : null
    })

    const results = await Promise.all(promises)
    return results.filter(Boolean) as Message[]
  }

  private async _updateIndex(type: 'conversations' | 'messages', ids: number[]): Promise<void> {
    const currentIndex = await this._getIndex()
    currentIndex[type] = ids
    await this._kv.set(this._indexKey, JSON.stringify(currentIndex))
  }

  private async _getIndex(): Promise<{ conversations?: number[]; messages?: number[] }> {
    const json = await this._kv.get(this._indexKey)
    const result = json ? (JSON.parse(json) as number[]) : {}
    return result
  }
}
