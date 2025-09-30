import type { Conversation, Message } from '@babadeluxe/shared'
import { damerauLevenshteinSimilarity } from './damerau-levenshtein-similarity.js'
import type { KeyValueStore } from './database/key-value-store.js'
import type { AppDb } from './database/db.js'

type SearchResult = (Conversation | Message) & {
  score: number
  highlights: string[]
  resultType: 'conversation' | 'message'
}

export class SearchService {
  constructor(
    private readonly _storage: KeyValueStore,
    private readonly _db: AppDb
  ) {}

  async indexData(): Promise<void> {
    // Get data from YOUR existing database
    const conversations = await this._db.conversation.toArray()
    const messages = await this._db.message.toArray()

    // Store in YOUR existing key-value store
    await this._storage.set('conversations', JSON.stringify(conversations))
    await this._storage.set('messages', JSON.stringify(messages))
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const rawConversations = await this._storage.get('conversations')
    const messageData = await this._storage.get('messages')

    const conversations: Conversation[] = rawConversations
      ? (JSON.parse(rawConversations) as Conversation[])
      : []
    const messages: Message[] = messageData ? (JSON.parse(messageData) as Message[]) : []

    const results: SearchResult[] = []

    // Use YOUR similarity function
    for (const conv of conversations) {
      const score = damerauLevenshteinSimilarity(query, conv.title)
      if (score > 0.3) {
        results.push({
          ...conv,
          score,
          highlights: [conv.title],
          resultType: 'conversation',
        })
      }
    }

    for (const message of messages) {
      const score = damerauLevenshteinSimilarity(query, message.content)
      if (score > 0.3) {
        results.push({
          ...message,
          score,
          highlights: [message.content.slice(0, 100)],
          resultType: 'message',
        })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }
}
