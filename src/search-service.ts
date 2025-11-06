import type { Conversation, Message } from '@babadeluxe/shared'
import { ok, err, type Result } from 'neverthrow'
import { damerauLevenshteinSimilarity } from './damerau-levenshtein-similarity'
import { type AppDb } from './database/app-db'
import type { SearchError, SearchResult } from './types/search-types'

export class SearchService {
  constructor(private readonly _db: AppDb) {}

  async search(query: string, limit = 10): Promise<Result<SearchResult[], SearchError>> {
    const conversationsResult = await this._db.getAllConversations()
    if (conversationsResult.isErr()) {
      return err({
        kind: 'DbError',
        message: conversationsResult.error.message,
      } as SearchError)
    }

    const allMessagesResult = await this._getAllMessages(conversationsResult.value)
    if (allMessagesResult.isErr()) {
      return err({
        kind: 'DbError',
        message: allMessagesResult.error.message,
      } as SearchError)
    }

    const searchResult = this._performSearch(
      query,
      [...conversationsResult.value],
      allMessagesResult.value,
      limit
    )

    return searchResult
  }

  private async _getAllMessages(
    conversations: readonly Conversation[]
  ): Promise<Result<Message[], { readonly code: string; readonly message: string }>> {
    const allMessages: Message[] = []

    for (const conversation of conversations) {
      const messagesResult = await this._db.getMessageByConversation(conversation.id)
      if (messagesResult.isErr()) return err(messagesResult.error)
      allMessages.push(...messagesResult.value)
    }

    return ok(allMessages)
  }

  private _performSearch(
    query: string,
    conversations: Conversation[],
    messages: Message[],
    limit: number
  ): Result<SearchResult[], never> {
    const results: SearchResult[] = []
    const normalizedQuery = query.toLowerCase()

    for (const conversation of conversations) {
      const score = this._getBestTokenScore(normalizedQuery, conversation.title)

      if (score > 0.3) {
        results.push({
          ...conversation,
          score,
          highlights: [conversation.title],
          resultType: 'conversation',
        })
      }
    }

    for (const message of messages) {
      const score = this._getBestTokenScore(normalizedQuery, message.content)

      console.log('Damerau Levenshtein Score: ', score)
      if (score > 0.3) {
        results.push({
          ...message,
          score,
          highlights: [message.content.slice(0, 100)],
          resultType: 'message',
        })
      }
    }

    return ok(results.sort((a, b) => b.score - a.score).slice(0, limit))
  }

  private _getBestTokenScore(query: string, text: string): number {
    const tokens = text.toLowerCase().split(/\s+/)
    let bestScore = 0

    for (const token of tokens) {
      const score = damerauLevenshteinSimilarity(query, token)
      if (score > bestScore) {
        bestScore = score
      }
    }

    return bestScore
  }
}
